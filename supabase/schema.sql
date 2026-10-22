-- JomGerak database setup for Supabase.
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run.
-- Safe to run again: it drops and recreates the demo tables.

drop table if exists reports, checkins, joins, buddy_requests, verifications cascade;

-- Resident reports of broken lights, damaged paths and so on
create table reports (
  id uuid primary key default gen_random_uuid(),
  park text not null check (park in ('central','lake','pocket')),
  seg text,
  type text not null check (type in ('Lighting','Damaged path','Flooding','Stray animals','Other')),
  spot text not null check (char_length(spot) between 3 and 120),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'Received' check (status in ('Received','In progress','Fixed')),
  when_label text,
  seed boolean not null default false,
  seed_status text,
  device_id text,
  created_at timestamptz not null default now()
);

-- "I'm here" check-ins: only park, time slot and an anonymous device id
create table checkins (
  id uuid primary key default gen_random_uuid(),
  park text not null check (park in ('central','lake','pocket')),
  slot text not null check (slot in ('early','morning','midday','evening','night')),
  device_id text not null check (char_length(device_id) between 8 and 64),
  created_at timestamptz not null default now()
);

create table joins (
  group_id text not null check (group_id ~ '^g[0-9]{1,2}$'),
  device_id text not null check (char_length(device_id) between 8 and 64),
  created_at timestamptz not null default now(),
  primary key (group_id, device_id)
);

create table buddy_requests (
  to_name text not null check (char_length(to_name) between 1 and 40),
  device_id text not null check (char_length(device_id) between 8 and 64),
  created_at timestamptz not null default now(),
  primary key (to_name, device_id)
);

-- Verified residents. The house number is stored for the check only and never shown.
create table verifications (
  device_id text primary key check (char_length(device_id) between 8 and 64),
  precinct int not null check (precinct between 1 and 8),
  house int not null check (house between 1 and 500),
  created_at timestamptz not null default now()
);

-- ---------- access rules (Row Level Security) ----------
-- Prototype rule: anyone with the app key can read and add rows. A pilot would use
-- Supabase Auth with separate resident and management roles.
alter table reports enable row level security;
alter table checkins enable row level security;
alter table joins enable row level security;
alter table buddy_requests enable row level security;
alter table verifications enable row level security;

create policy "read reports" on reports for select using (true);
create policy "add reports" on reports for insert with check (seed = false and status = 'Received');
create policy "update report status" on reports for update using (true) with check (true);
revoke update on reports from anon, authenticated;
grant update (status) on reports to anon, authenticated;   -- only the status can change

create policy "read checkins" on checkins for select using (true);
create policy "add checkins" on checkins for insert with check (true);

create policy "read joins" on joins for select using (true);
create policy "add joins" on joins for insert with check (true);
create policy "leave joins" on joins for delete using (true);

create policy "read requests" on buddy_requests for select using (true);
create policy "add requests" on buddy_requests for insert with check (true);

-- Only the count per precinct is readable; inserts go through verify_resident().
create policy "read verifications" on verifications for select using (true);
revoke select on verifications from anon, authenticated;
grant select (device_id, precinct, created_at) on verifications to anon, authenticated;

-- ---------- server-side resident check ----------
create or replace function verify_resident(p_device text, p_precinct int, p_house int, p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_precinct not between 1 and 8 or p_house not between 1 and 500 then return false; end if;
  if upper(trim(p_code)) <> 'ELM-' || p_precinct || '-' || ((p_house * 37 + p_precinct * 11) % 900 + 100) then
    return false;
  end if;
  insert into verifications (device_id, precinct, house) values (p_device, p_precinct, p_house)
  on conflict (device_id) do update set precinct = excluded.precinct, house = excluded.house, created_at = now();
  return true;
end $$;

create or replace function unverify_resident(p_device text)
returns void language sql security definer set search_path = public as $$
  delete from verifications where device_id = p_device;
$$;

-- ---------- reset demo data (dashboard button) ----------
create or replace function reset_demo()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from checkins where true;
  delete from joins where true;
  delete from buddy_requests where true;
  delete from verifications where true;
  delete from reports where seed = false;
  update reports set status = seed_status where seed = true;
end $$;

grant execute on function verify_resident(text,int,int,text), unverify_resident(text), reset_demo() to anon, authenticated;

-- ---------- example reports ----------
insert into reports (park, seg, type, spot, note, status, when_label, seed, seed_status, created_at) values
 ('lake','l-n','Lighting','North stretch near the jetty','Two lamps out, very dark after 7 pm.','Received','Wk 7, Tue',true,'Received', now() - interval '13 days'),
 ('lake','l-e','Lighting','Bend by the wetland boardwalk','Lamp flickering then off.','Received','Wk 7, Thu',true,'Received', now() - interval '11 days'),
 ('lake','l-n','Lighting','North stretch','Still dark, I walked Central Park instead.','Received','Wk 8, Mon',true,'Received', now() - interval '7 days'),
 ('central','c-s','Damaged path','Loop near playground','Raised paving slab, tripping risk.','In progress','Wk 8, Sat',true,'In progress', now() - interval '2 days');

-- ---------- live updates ----------
alter publication supabase_realtime add table reports, checkins, joins;
