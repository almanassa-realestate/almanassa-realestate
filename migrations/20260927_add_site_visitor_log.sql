-- Anonymous page counts and admin-only visit history.
create table public.site_visits (
  id bigint generated always as identity primary key,
  visit_kind text not null check (visit_kind in ('site','property')),
  property_number bigint,
  created_at timestamptz not null default now(),
  constraint site_visits_kind_property_check check (
    (visit_kind='site' and property_number is null) or
    (visit_kind='property' and property_number is not null and property_number > 0)
  )
);
create index site_visits_created_at_idx on public.site_visits (created_at desc);
alter table public.site_visits enable row level security;
revoke all on public.site_visits from anon, authenticated;
grant insert (visit_kind, property_number) on public.site_visits to anon;
grant select on public.site_visits to authenticated;
grant usage on sequence public.site_visits_id_seq to anon;
create policy site_visits_public_insert on public.site_visits
  for insert to anon with check (
    (visit_kind='site' and property_number is null) or
    (visit_kind='property' and property_number in
      (select property_number from public.properties where status='published'))
  );
create policy site_visits_admin_read on public.site_visits
  for select to authenticated using (
    exists (select 1 from public.profiles
      where id=(select auth.uid()) and is_active=true and role in ('admin','editor'))
  );
