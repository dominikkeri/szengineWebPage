-- V5: explicit N/A results and linked fault-stop issue tickets.
-- Apply after 001 and 002; preserves existing run snapshots.
begin;
alter table public.issues add column workflow_run_id uuid references public.workflow_runs(id) on delete restrict;
create index issues_workflow_run_idx on public.issues(workflow_run_id) where workflow_run_id is not null;
grant insert (workflow_run_id) on public.issues to authenticated;
-- Existing operator-only insert policy remains; linked records must be fault stops.
alter policy issues_insert on public.issues with check (
  public.is_operator() and created_by=(select auth.uid()) and (
    workflow_run_id is null or exists(select 1 from public.workflow_runs r where r.id=issues.workflow_run_id and r.stop_fault)
  )
);
create function public.workflow_all_resolved(items jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_array_length(items)>0 and not exists(select 1 from jsonb_array_elements(items) a(x) where (x->>'checked_at' is not null) = (x->>'skipped_at' is not null));
$$;
revoke all on function public.workflow_all_resolved(jsonb) from public;
create or replace function public.workflow_action(p_action text,p_run_id uuid default null,p_data jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r public.workflow_runs%rowtype; a public.workflow_templates%rowtype; b public.workflow_templates%rowtype;
  actor uuid=auth.uid(); actor_name text; bench public.bench_status; list jsonb; new_list jsonb; checked boolean; skipped boolean; stamp timestamptz; fault boolean;
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
  when 'tick', 'skip' then
    if r.stage not in ('preparing','shutdown') or (p_action='tick' and jsonb_typeof(p_data->'checked') is distinct from 'boolean') or (p_action='skip' and jsonb_typeof(p_data->'skipped') is distinct from 'boolean') then raise exception 'Ez a pont nem szerkesztheto'; end if;
    list=case when r.stage='preparing' then r.pre_items else r.post_items end;
    if not exists(select 1 from jsonb_array_elements(list) a(x) where x->>'id'=p_data->>'point_id') then raise exception 'Ismeretlen pont'; end if;
    checked=case when p_action='tick' then (p_data->>'checked')::boolean else false end;
    skipped=case when p_action='skip' then (p_data->>'skipped')::boolean else false end;
    select jsonb_agg(case when x->>'id'=p_data->>'point_id' then x || jsonb_build_object('checked_at',case when checked then stamp else null end,'checked_by',case when checked then actor else null end,'checked_name',case when checked then actor_name else null end,'skipped_at',case when skipped then stamp else null end,'skipped_by',case when skipped then actor else null end,'skipped_name',case when skipped then actor_name else null end) else x end order by ord) into new_list from jsonb_array_elements(list) with ordinality a(x,ord);
    if r.stage='preparing' then update public.workflow_runs set pre_items=new_list where id=r.id;
    else update public.workflow_runs set post_items=new_list where id=r.id; end if;
  when 'ready' then
    if r.stage<>'preparing' or bench<>'idle' or not public.workflow_all_resolved(r.pre_items) then raise exception 'Minden inditas elotti pontrol nyilatkozni kell'; end if;
    update public.workflow_runs set stage='ready',setup=public.workflow_validate_setup(r.setup),pre_completed_at=stamp,pre_completed_name=actor_name where id=r.id;
  when 'start' then
    if r.stage<>'ready' or bench<>'idle' or not public.workflow_all_resolved(r.pre_items) then raise exception 'Az inditas elotti ellenorzes nincs lezarva'; end if;
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
    if r.stage<>'shutdown' or not public.workflow_all_resolved(r.post_items) then raise exception 'Minden leallitasi pontrol nyilatkozni kell'; end if;
    update public.workflow_runs set stage='completed',closed_at=stamp,closed_name=actor_name where id=r.id;
  when 'cancel' then
    if r.stage not in ('preparing','ready') then raise exception 'Csak az elokeszites szakithato meg'; end if;
    update public.workflow_runs set stage='cancelled',closed_at=stamp,closed_name=actor_name where id=r.id;
  else raise exception 'Ismeretlen muvelet';
  end case;
end; $$;

commit;
