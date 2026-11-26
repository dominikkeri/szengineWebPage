-- SZEngine testbench v1 – run ONCE in Supabase SQL Editor.
-- Backend security is enforced in Postgres RLS, not in the React UI.
create extension if not exists pgcrypto with schema extensions;

create type public.member_role as enum ('admin', 'operator', 'viewer');
create type public.bench_status as enum ('idle', 'running', 'maintenance', 'fault');
create type public.issue_status as enum ('active', 'in_progress', 'done');
create type public.issue_priority as enum ('low', 'medium', 'high');
create type public.checklist_kind as enum ('pre_start', 'shutdown');
create type public.checklist_run_status as enum ('in_progress', 'completed');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9._-]{3,30}$'),
  email text not null,
  role public.member_role not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index profiles_username_lower_idx on public.profiles (lower(username));
create unique index profiles_email_lower_idx on public.profiles (lower(email));

-- Profile is created automatically when Supabase Auth creates an account.
create or replace function public.on_auth_user_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  base_name text;
begin
  base_name := regexp_replace(lower(split_part(coalesce(new.email, 'user'), '@', 1)), '[^a-z0-9._-]', '', 'g');
  if length(base_name) < 3 then base_name := 'user'; end if;
  insert into public.profiles (id, username, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), left(base_name, 20) || '_' || substr(new.id::text, 1, 6)),
    new.email
  );
  return new;
end;
$$;
create trigger auth_created_profile after insert on auth.users
for each row execute function public.on_auth_user_created();

-- Prevent privilege escalation / disabled sessions reading data.
create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
    where id = (select auth.uid()) and is_active);
$$;
create or replace function public.is_operator()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
    where id = (select auth.uid()) and is_active and role in ('admin','operator'));
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
    where id = (select auth.uid()) and is_active and role = 'admin');
$$;
revoke all on function public.is_member() from public;
revoke all on function public.is_operator() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_member() to authenticated;
grant execute on function public.is_operator() to authenticated;
grant execute on function public.is_admin() to authenticated;

create or replace function public.prevent_self_lockout()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.id = (select auth.uid()) and (new.role is distinct from old.role or new.is_active = false) then
    raise exception 'Sajat admin jogosultsag vagy fiok nem modosithato';
  end if;
  if (select auth.uid()) is not null and (new.username is distinct from old.username or new.email is distinct from old.email) then
    raise exception 'Felhasznalonev es email itt nem modosithato';
  end if;
  return new;
end;
$$;
create trigger profile_self_lockout before update on public.profiles
for each row execute function public.prevent_self_lockout();

create table public.bench_state (
  id integer primary key default 1 check (id = 1),
  status public.bench_status not null default 'idle',
  note text not null default '',
  last_run_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
insert into public.bench_state (id) values (1);

create table public.bench_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  started_by uuid references public.profiles(id) on delete set null,
  stopped_by uuid references public.profiles(id) on delete set null
);
create unique index one_active_bench_run on public.bench_runs ((true)) where ended_at is null;

create table public.status_events (
  id uuid primary key default gen_random_uuid(),
  from_status public.bench_status not null,
  to_status public.bench_status not null,
  note text not null default '',
  changed_at timestamptz not null default now(),
  changed_by uuid not null references public.profiles(id)
);

-- Atomic, audited state transitions. Browser users cannot directly edit bench_state.
create or replace function public.set_bench_status(new_status public.bench_status, new_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  before_status public.bench_status;
begin
  if not public.is_operator() then raise exception 'Nincs jogosultsag'; end if;
  if length(coalesce(new_note, '')) > 500 then raise exception 'Tul hosszu megjegyzes'; end if;
  select status into before_status from public.bench_state where id = 1 for update;
  if before_status = new_status then
    update public.bench_state set note = coalesce(new_note,''), updated_at = now(), updated_by = (select auth.uid()) where id = 1;
    return;
  end if;
  if before_status = 'running' and new_status <> 'running' then
    update public.bench_runs set ended_at = now(), stopped_by = (select auth.uid()) where ended_at is null;
  elsif before_status <> 'running' and new_status = 'running' then
    insert into public.bench_runs(started_by) values ((select auth.uid()));
  end if;
  update public.bench_state set
    status = new_status,
    note = coalesce(new_note,''),
    last_run_at = case when before_status = 'running' and new_status <> 'running' then now() else last_run_at end,
    updated_at = now(), updated_by = (select auth.uid())
  where id = 1;
  insert into public.status_events (from_status, to_status, note, changed_by)
  values (before_status, new_status, coalesce(new_note,''), (select auth.uid()));
end;
$$;
revoke all on function public.set_bench_status(public.bench_status, text) from public;
grant execute on function public.set_bench_status(public.bench_status, text) to authenticated;

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 3 and 150),
  description text not null default '' check (length(description) <= 4000),
  priority public.issue_priority not null default 'medium',
  status public.issue_status not null default 'active',
  estimated_fix_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index issues_status_idx on public.issues (status, created_at desc);

create or replace function public.guard_issue_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'Nem modosithato letrehozoi adat';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger issue_updated_at before update on public.issues
for each row execute function public.guard_issue_update();

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  kind public.checklist_kind not null,
  position integer not null check (position > 0),
  title text not null,
  description text not null default '',
  unique (kind, position)
);

create table public.checklist_runs (
  id uuid primary key default gen_random_uuid(),
  kind public.checklist_kind not null,
  status public.checklist_run_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  started_by uuid not null default auth.uid() references public.profiles(id)
);
create unique index one_open_checklist_per_kind on public.checklist_runs(kind) where status = 'in_progress';

create table public.checklist_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.checklist_runs(id) on delete cascade,
  item_id uuid not null references public.checklist_items(id),
  is_checked boolean not null default false,
  checked_at timestamptz,
  checked_by uuid references public.profiles(id),
  unique (run_id, item_id)
);

-- Snapshot current checklist template as soon as the checklist starts.
create or replace function public.populate_checklist_run()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.checklist_run_items(run_id, item_id)
  select new.id, id from public.checklist_items where kind = new.kind;
  return new;
end;
$$;
create trigger populate_run after insert on public.checklist_runs
for each row execute function public.populate_checklist_run();

-- Browser changes only the checkbox; checked_by/checked_at are supplied by DB.
create or replace function public.check_checklist_item(p_run_item_id uuid, p_checked boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  run_status public.checklist_run_status;
begin
  if not public.is_operator() then raise exception 'Nincs jogosultsag'; end if;
  select r.status into run_status from public.checklist_run_items i
    join public.checklist_runs r on r.id = i.run_id
    where i.id = p_run_item_id for update of r;
  if run_status is null or run_status <> 'in_progress' then raise exception 'Ez a checklist mar nem szerkesztheto'; end if;
  update public.checklist_run_items set is_checked = p_checked,
    checked_at = case when p_checked then now() else null end,
    checked_by = case when p_checked then (select auth.uid()) else null end
  where id = p_run_item_id;
end;
$$;
revoke all on function public.check_checklist_item(uuid, boolean) from public;
grant execute on function public.check_checklist_item(uuid, boolean) to authenticated;

create or replace function public.finish_checklist(p_run_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_status public.checklist_run_status;
begin
  if not public.is_operator() then raise exception 'Nincs jogosultsag'; end if;
  select status into current_status from public.checklist_runs where id = p_run_id for update;
  if current_status is null or current_status <> 'in_progress' then raise exception 'Ez a checklist nem aktiv'; end if;
  if not exists (select 1 from public.checklist_run_items where run_id = p_run_id) then
    raise exception 'Ures checklist nem zarhato le';
  end if;
  if exists (select 1 from public.checklist_run_items where run_id = p_run_id and not is_checked) then
    raise exception 'Eloszor minden pontot pipalj ki';
  end if;
  update public.checklist_runs set status = 'completed', completed_at = now() where id = p_run_id;
end;
$$;
revoke all on function public.finish_checklist(uuid) from public;
grant execute on function public.finish_checklist(uuid) to authenticated;

-- Row Level Security: unauthenticated visitors see NOTHING.
alter table public.profiles enable row level security;
alter table public.bench_state enable row level security;
alter table public.bench_runs enable row level security;
alter table public.status_events enable row level security;
alter table public.issues enable row level security;
alter table public.checklist_items enable row level security;
alter table public.checklist_runs enable row level security;
alter table public.checklist_run_items enable row level security;

create policy profiles_read on public.profiles for select to authenticated
using (public.is_admin() or (id = (select auth.uid()) and public.is_member()));
create policy profiles_admin_update on public.profiles for update to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy state_read on public.bench_state for select to authenticated using (public.is_member());
create policy runs_read on public.bench_runs for select to authenticated using (public.is_member());
create policy events_read on public.status_events for select to authenticated using (public.is_member());
create policy issues_read on public.issues for select to authenticated using (public.is_member());
create policy issues_insert on public.issues for insert to authenticated
with check (public.is_operator() and created_by = (select auth.uid()));
create policy issues_update on public.issues for update to authenticated
using (public.is_operator()) with check (public.is_operator());
create policy items_read on public.checklist_items for select to authenticated using (public.is_member());
create policy checklist_runs_read on public.checklist_runs for select to authenticated using (public.is_member());
create policy checklist_runs_insert on public.checklist_runs for insert to authenticated
with check (public.is_operator() and started_by = (select auth.uid()) and status = 'in_progress' and completed_at is null);
create policy checklist_run_items_read on public.checklist_run_items for select to authenticated using (public.is_member());

-- Narrow public grants. No client-side writes to history/state/template tables.
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles, public.bench_state, public.bench_runs, public.status_events,
  public.issues, public.checklist_items, public.checklist_runs, public.checklist_run_items to authenticated;
grant update (role, is_active) on public.profiles to authenticated;
grant insert (title, description, priority, estimated_fix_at) on public.issues to authenticated;
grant update (title, description, priority, status, estimated_fix_at) on public.issues to authenticated;
grant insert (kind) on public.checklist_runs to authenticated;

-- Demo-free, editable example checklist templates: adjust them to the REAL bench procedure.
insert into public.checklist_items(kind, position, title, description) values
('pre_start',1,'Vészleállító és biztonsági kör','Vészleállító, külső megszakítók és engedélyező jelek ellenőrzése'),
('pre_start',2,'Üzemanyag-rendszer','Csövek, csatlakozók, szivárgás és nyomásellenőrzés'),
('pre_start',3,'Hűtőrendszerek','Hűtőfolyadék, szivattyúk, ventilátorok és tömítettség'),
('pre_start',4,'Szenzorok és adatgyűjtés','NI, KiBox, ECU és mérőcsatornák ellenőrzése'),
('pre_start',5,'Forgó alkatrészek és védőburkolatok','Mechanikai rögzítések és biztonsági zónák ellenőrzése'),
('pre_start',6,'Fékpad üzemkész','Fékpadvezérlés és vészleállítás ellenőrzése'),
('shutdown',1,'Motor leállítása','Fordulatszám 0, gyújtás és befecskendezés leállítva'),
('shutdown',2,'Fékpad biztonságos állapota','Villamos hajtás és forgó tömegek nyugalomban'),
('shutdown',3,'Hőelvezetés','Szükséges utóhűtés biztosítása'),
('shutdown',4,'Üzemanyag-ellátás','Szivattyú és szelepek biztonságos állapotban'),
('shutdown',5,'Adatok archiválása','NI, KiBox és ECU logfájlok elmentése'),
('shutdown',6,'Munkaterület lezárása','Szivárgás, sérülés, rendellenesség ellenőrzése');

-- Enable live updates: the React client additionally refetches secured data.
alter publication supabase_realtime add table public.bench_state;
alter publication supabase_realtime add table public.issues;
alter publication supabase_realtime add table public.checklist_runs;
alter publication supabase_realtime add table public.checklist_run_items;
alter publication supabase_realtime add table public.status_events;

-- First administrator (AFTER creating an Auth user in Supabase dashboard):
-- update public.profiles set username = 'dominik', role = 'admin'
-- where email = 'dominik@example.com';
-- Disable public signup in Supabase Authentication settings after initial setup.
