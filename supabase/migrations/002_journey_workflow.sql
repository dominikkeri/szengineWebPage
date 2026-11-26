-- V4: paired, immutable checklist snapshots per documented engine run.
-- Run after 001, exactly once, with the old bench stopped.
begin;
lock table public.bench_state in access exclusive mode;
do $$ begin
  if exists(select 1 from public.bench_state where status='running') or exists(select 1 from public.bench_runs where ended_at is null) then
    raise exception 'A migracio elott allitsd le a regi rendszerben a jaratast.';
  end if;
end; $$;
create table public.workflow_templates (
  kind public.checklist_kind primary key,
  revision integer not null default 1 check(revision>0),
  items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items)>0)
);
create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  number integer generated always as identity unique,
  stage text not null default 'preparing' check(stage in ('preparing','ready','running','shutdown','completed','cancelled')),
  setup jsonb not null,
  created_at timestamptz not null default now(), created_by uuid not null references public.profiles(id), created_name text not null,
  pre_revision integer not null, post_revision integer not null,
  pre_items jsonb not null, post_items jsonb not null,
  pre_completed_at timestamptz, pre_completed_name text,
  started_at timestamptz, started_name text,
  stopped_at timestamptz, stopped_name text,
  closed_at timestamptz, closed_name text,
  stop_fault boolean not null default false,
  check(jsonb_typeof(pre_items)='array' and jsonb_array_length(pre_items)>0),
  check(jsonb_typeof(post_items)='array' and jsonb_array_length(post_items)>0)
);
create unique index workflow_one_open on public.workflow_runs ((true)) where stage not in ('completed','cancelled');
alter table public.workflow_templates enable row level security;
alter table public.workflow_runs enable row level security;
create policy workflow_templates_read on public.workflow_templates for select to authenticated using(public.is_member());
create policy workflow_runs_read on public.workflow_runs for select to authenticated using(public.is_member());
revoke all on public.workflow_templates,public.workflow_runs from anon,authenticated;
grant select on public.workflow_templates,public.workflow_runs to authenticated;
-- Disable the V3 unpaired checklist write paths, preserving their historical data.
revoke insert on public.checklist_runs from authenticated;
revoke insert(kind) on public.checklist_runs from authenticated;
revoke execute on function public.check_checklist_item(uuid,boolean),public.finish_checklist(uuid) from authenticated,public;
-- Existing atomic audit/state updater is now internal only.
alter function public.set_bench_status(public.bench_status,text) rename to workflow_internal_set_status;
revoke execute on function public.workflow_internal_set_status(public.bench_status,text) from public,authenticated,anon;
create function public.set_bench_status(new_status public.bench_status,new_note text default '') returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Nincs jogosultsag'; end if;
  perform 1 from public.bench_state where id=1 for update;
  if new_status is null or new_status='running' or exists(select 1 from public.workflow_runs where stage not in ('completed','cancelled')) then
    raise exception 'A jaratas allapotat a Checklist oldalon modositsd.';
  end if;
  perform public.workflow_internal_set_status(new_status,new_note);
end; $$;
revoke all on function public.set_bench_status(public.bench_status,text) from public;
grant execute on function public.set_bench_status(public.bench_status,text) to authenticated;
-- Only names and IDs, never the email addresses of other users.
create function public.workflow_member_directory() returns table(id uuid,username text)
language sql stable security definer set search_path='' as $$
 select p.id,p.username::text from public.profiles p where p.is_active and public.is_member() order by p.username;
$$;
revoke all on function public.workflow_member_directory() from public;
grant execute on function public.workflow_member_directory() to authenticated;
create function public.workflow_validate_setup(s jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare responsible text; k text; hours numeric;
begin
  if jsonb_typeof(s) is distinct from 'object' then raise exception 'Hianyzo setup'; end if;
  if not coalesce(s->>'motor' in ('OEM','GEN1') and s->>'intake' in ('NA','SK1','NGT') and s->>'exhaust' in ('NA','SK1','NGT') and s->>'muffler' in ('Raceshop','Gabi','RC-1 dob') and s->>'cam' in ('OEM','Állítható','Roulett'),false) then raise exception 'Ervenytelen setup'; end if;
  select p.username into responsible from public.profiles p where p.id::text=s->>'responsible_id' and p.is_active;
  if responsible is null then raise exception 'Valassz aktiv jaratasfelelost'; end if;
  foreach k in array array['map','purpose','attendees'] loop
    if jsonb_typeof(s->k) is distinct from 'string' or length(btrim(s->>k)) not between 1 and 1000 then raise exception 'Hianyzo vagy ervenytelen szoveges mezo: %',k; end if;
  end loop;
  if jsonb_typeof(s->'initial_hours') is distinct from 'number' then raise exception 'Hianyzo uzemora'; end if;
  hours=(s->>'initial_hours')::numeric;
  if hours<0 or hours>10000000 then raise exception 'Ervenytelen uzemora'; end if;
  return jsonb_build_object('motor',s->>'motor','intake',s->>'intake','exhaust',s->>'exhaust','muffler',s->>'muffler','cam',s->>'cam','responsible_id',s->>'responsible_id','responsible_name',responsible,'map',btrim(s->>'map'),'purpose',btrim(s->>'purpose'),'attendees',btrim(s->>'attendees'),'initial_hours',hours);
end; $$;
revoke all on function public.workflow_validate_setup(jsonb) from public,authenticated;
create function public.workflow_save_template(p_kind public.checklist_kind,p_revision integer,p_items jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare clean jsonb;
begin
  if not public.is_admin() then raise exception 'Csak admin szerkesztheti a sablont'; end if;
  perform 1 from public.bench_state where id=1 for update;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Ervenytelen sablon'; end if;
  if jsonb_array_length(p_items) not between 1 and 200 then raise exception '1-200 pont szukseges'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) as a(x) where jsonb_typeof(x) is distinct from 'object' or jsonb_typeof(x->'id') is distinct from 'string' or jsonb_typeof(x->'group') is distinct from 'string' or jsonb_typeof(x->'title') is distinct from 'string' or length(btrim(x->>'id')) not between 1 and 100 or length(btrim(x->>'group')) not between 1 and 100 or length(btrim(x->>'title')) not between 1 and 300) then raise exception 'Minden pont csoportja es neve kotelezo'; end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(p_items) a(x))<>jsonb_array_length(p_items) then raise exception 'Ismetlodo pontazonosito'; end if;
  select jsonb_agg(jsonb_build_object('id',x->>'id','group',btrim(x->>'group'),'title',btrim(x->>'title')) order by ord) into clean from jsonb_array_elements(p_items) with ordinality as a(x,ord);
  update public.workflow_templates set items=clean,revision=revision+1 where kind=p_kind and revision=p_revision;
  if not found then raise exception 'A sablon idokozben megvaltozott. Frissitsd az oldalt.'; end if;
end; $$;
revoke all on function public.workflow_save_template(public.checklist_kind,integer,jsonb) from public;
grant execute on function public.workflow_save_template(public.checklist_kind,integer,jsonb) to authenticated;
create function public.workflow_snapshot(items jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_agg(x || jsonb_build_object('checked_at',null,'checked_by',null,'checked_name',null) order by ord) from jsonb_array_elements(items) with ordinality a(x,ord);
$$;
create function public.workflow_all_checked(items jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_array_length(items)>0 and not exists(select 1 from jsonb_array_elements(items) a(x) where x->>'checked_at' is null);
$$;
revoke all on function public.workflow_snapshot(jsonb),public.workflow_all_checked(jsonb) from public;
create function public.workflow_action(p_action text,p_run_id uuid default null,p_data jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r public.workflow_runs%rowtype; a public.workflow_templates%rowtype; b public.workflow_templates%rowtype;
  actor uuid=auth.uid(); actor_name text; bench public.bench_status; list jsonb; new_list jsonb; checked boolean; stamp timestamptz; fault boolean;
begin
  if not public.is_operator() then raise exception 'Nincs operatori jogosultsag'; end if;
  -- All workflow, template and manual state mutations serialize on the same row.
  select status into bench from public.bench_state where id=1 for update;
  stamp=clock_timestamp();
  select username into actor_name from public.profiles where id=actor;
  select * into r from public.workflow_runs where stage not in ('completed','cancelled') for update;
  if p_action='create' then
    if r.id is not null or bench<>'idle' then raise exception 'Uj jaratas csak leallitott, szabad fekpadon nyithato'; end if;
    select * into strict a from public.workflow_templates where kind='pre_start';
    select * into strict b from public.workflow_templates where kind='shutdown';
    insert into public.workflow_runs(setup,created_by,created_name,pre_revision,post_revision,pre_items,post_items) values(public.workflow_validate_setup(p_data->'setup'),actor,actor_name,a.revision,b.revision,public.workflow_snapshot(a.items),public.workflow_snapshot(b.items));
    return;
  end if;
  if r.id is null or r.id is distinct from p_run_id then raise exception 'A jaratas nem aktiv'; end if;
  case p_action
  when 'setup' then
    if r.stage<>'preparing' then raise exception 'A setup mar nem szerkesztheto'; end if;
    update public.workflow_runs set setup=public.workflow_validate_setup(p_data->'setup') where id=r.id;
  when 'tick' then
    if r.stage not in ('preparing','shutdown') or jsonb_typeof(p_data->'checked') is distinct from 'boolean' then raise exception 'Ez a pont nem szerkesztheto'; end if;
    list=case when r.stage='preparing' then r.pre_items else r.post_items end;
    if not exists(select 1 from jsonb_array_elements(list) a(x) where x->>'id'=p_data->>'point_id') then raise exception 'Ismeretlen pont'; end if;
    checked=(p_data->>'checked')::boolean;
    select jsonb_agg(case when x->>'id'=p_data->>'point_id' then x || jsonb_build_object('checked_at',case when checked then stamp else null end,'checked_by',case when checked then actor else null end,'checked_name',case when checked then actor_name else null end) else x end order by ord) into new_list from jsonb_array_elements(list) with ordinality a(x,ord);
    if r.stage='preparing' then update public.workflow_runs set pre_items=new_list where id=r.id;
    else update public.workflow_runs set post_items=new_list where id=r.id; end if;
  when 'ready' then
    if r.stage<>'preparing' or bench<>'idle' or not public.workflow_all_checked(r.pre_items) then raise exception 'Elobb teljesits minden inditas elotti pontot'; end if;
    update public.workflow_runs set stage='ready',setup=public.workflow_validate_setup(r.setup),pre_completed_at=stamp,pre_completed_name=actor_name where id=r.id;
  when 'start' then
    if r.stage<>'ready' or bench<>'idle' or not public.workflow_all_checked(r.pre_items) then raise exception 'Az inditas elotti ellenorzes nincs lezarva'; end if;
    perform public.workflow_validate_setup(r.setup);
    perform public.workflow_internal_set_status('running',left('Járatás #'||r.number||' – '||(r.setup->>'purpose'),500));
    update public.workflow_runs set stage='running',started_at=stamp,started_name=actor_name where id=r.id;
  when 'stop' then
    if r.stage<>'running' then raise exception 'Nincs folyamatban jaratas'; end if;
    if p_data ? 'fault' and jsonb_typeof(p_data->'fault') is distinct from 'boolean' then raise exception 'Ervenytelen leallasi adat'; end if;
    fault=coalesce((p_data->>'fault')::boolean,false);
    perform public.workflow_internal_set_status(case when fault then 'fault'::public.bench_status else 'idle'::public.bench_status end,'Járatás #'||r.number||' leállítva – checklist szükséges');
    update public.workflow_runs set stage='shutdown',stopped_at=stamp,stopped_name=actor_name,stop_fault=fault where id=r.id;
  when 'close' then
    if r.stage<>'shutdown' or not public.workflow_all_checked(r.post_items) then raise exception 'Elobb teljesits minden leallitasi pontot'; end if;
    update public.workflow_runs set stage='completed',closed_at=stamp,closed_name=actor_name where id=r.id;
  when 'cancel' then
    if r.stage not in ('preparing','ready') then raise exception 'Csak az elokeszites szakithato meg'; end if;
    update public.workflow_runs set stage='cancelled',closed_at=stamp,closed_name=actor_name where id=r.id;
  else raise exception 'Ismeretlen muvelet';
  end case;
end; $$;
revoke all on function public.workflow_action(text,uuid,jsonb) from public;
grant execute on function public.workflow_action(text,uuid,jsonb) to authenticated;
insert into public.workflow_templates(kind,items) values ('pre_start',$seed$[{"id": "pre-1", "group": "Motor", "title": "Olaj a motorban"}, {"id": "pre-2", "group": "Motor", "title": "Olajhutő venti csati"}, {"id": "pre-3", "group": "Motor", "title": "Catchcan szint"}, {"id": "pre-4", "group": "Motor", "title": "Karter csövek"}, {"id": "pre-5", "group": "Motor", "title": "TDC Lock alátétek behelyezve"}, {"id": "pre-6", "group": "Motor", "title": "Olaj a turbo körében"}, {"id": "pre-7", "group": "Motor", "title": "Víz a motor körében"}, {"id": "pre-8", "group": "Motor", "title": "Motor vízpumpa csati"}, {"id": "pre-9", "group": "Motor", "title": "Motor huto ventillator csati"}, {"id": "pre-10", "group": "Motor", "title": "Injektor lefogató"}, {"id": "pre-11", "group": "Motor", "title": "Injektor csatlakozó"}, {"id": "pre-12", "group": "Motor", "title": "Üzemanyag csövek"}, {"id": "pre-13", "group": "Motor", "title": "Üzemanyag pumpa csatlakozó"}, {"id": "pre-14", "group": "Motor", "title": "Solenoid csatlakozó"}, {"id": "pre-15", "group": "Motor", "title": "MAP csövek"}, {"id": "pre-16", "group": "Motor", "title": "Folytószelep csatlakozó"}, {"id": "pre-17", "group": "Motor", "title": "Trafó csatlakoztatva"}, {"id": "pre-18", "group": "Motor", "title": "Gyujtogyertya kábelek"}, {"id": "pre-19", "group": "Motor", "title": "Nem lóg semmi a kipufogóra?"}, {"id": "pre-20", "group": "Motor", "title": "Nem lóg semmi a kék tengelybe?"}, {"id": "pre-21", "group": "Szenzorok", "title": "PSTF Motor külső olajkör"}, {"id": "pre-22", "group": "Szenzorok", "title": "PSTF Turbo olaj bemenet"}, {"id": "pre-23", "group": "Szenzorok", "title": "PT100 Turbo olaj kimenet"}, {"id": "pre-24", "group": "Szenzorok", "title": "CLT Szenzor"}, {"id": "pre-25", "group": "Szenzorok", "title": "PT100 Víz turbo elott"}, {"id": "pre-26", "group": "Szenzorok", "title": "PT100 víz turbo utan"}, {"id": "pre-27", "group": "Szenzorok", "title": "PT100/MAP szukitoben"}, {"id": "pre-28", "group": "Szenzorok", "title": "MAP turbo elott"}, {"id": "pre-29", "group": "Szenzorok", "title": "PT100/MAP InterCooler elott"}, {"id": "pre-30", "group": "Szenzorok", "title": "IAT Intercooler utan"}, {"id": "pre-31", "group": "Szenzorok", "title": "Veztengely cstlakozó"}, {"id": "pre-32", "group": "Szenzorok", "title": "Főtengely csatlakozó"}, {"id": "pre-33", "group": "Szenzorok", "title": "Kopogás szenzor"}, {"id": "pre-34", "group": "Szenzorok", "title": "MAF"}, {"id": "pre-35", "group": "Szenzorok", "title": "lambda"}, {"id": "pre-36", "group": "Kiszolgálórendszerek", "title": "Táp bedugva"}, {"id": "pre-37", "group": "Kiszolgálórendszerek", "title": "NI Csatlakoztatva"}, {"id": "pre-38", "group": "Kiszolgálórendszerek", "title": "Kompresszor bekapcsolva"}, {"id": "pre-39", "group": "Indikálás", "title": "Kipufogo kondicionálás bekapcsolva"}, {"id": "pre-40", "group": "Indikálás", "title": "Hideg oldali indikálás"}, {"id": "pre-41", "group": "Indikálás", "title": "Hengerindikálás"}, {"id": "pre-42", "group": "Indikálás", "title": "Meleg oldali indikálás"}, {"id": "pre-43", "group": "Indikálás", "title": "Lakatfogók bekapcsolva"}, {"id": "pre-44", "group": "Indikálás", "title": "Meleg oldali indikálás táp bedugva"}, {"id": "pre-45", "group": "Funkcióteszt", "title": "Vízpumpa"}, {"id": "pre-46", "group": "Funkcióteszt", "title": "Víz venti"}, {"id": "pre-47", "group": "Funkcióteszt", "title": "Intercooler pumpa"}, {"id": "pre-48", "group": "Funkcióteszt", "title": "Intercooler venti"}, {"id": "pre-49", "group": "Funkcióteszt", "title": "Üzemanyag pumpa"}, {"id": "pre-50", "group": "Funkcióteszt", "title": "Üzemanyag nyomás"}, {"id": "pre-51", "group": "Funkcióteszt", "title": "Olaj venti"}, {"id": "pre-52", "group": "Funkcióteszt", "title": "Solenoid"}]$seed$::jsonb);
insert into public.workflow_templates(kind,items) values ('shutdown',$seed$[{"id": "post-1", "group": "Leállítás", "title": "Kipufogó kihűtve"}, {"id": "post-2", "group": "Leállítás", "title": "NI lecsatlakoztatva"}, {"id": "post-3", "group": "Leállítás", "title": "Kondicionalo kikapcsolva"}, {"id": "post-4", "group": "Leállítás", "title": "Táp kihuzva"}, {"id": "post-5", "group": "Leállítás", "title": "Kompresszor lekapcsolva"}, {"id": "post-6", "group": "Leállítás", "title": "Meleg oldali indikalas tap lehuzva"}, {"id": "post-7", "group": "Leállítás", "title": "Lakatfogók kikapcsolva"}]$seed$::jsonb);
alter publication supabase_realtime add table public.workflow_runs,public.workflow_templates;
commit;
