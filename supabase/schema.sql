-- Run this script in the Supabase SQL Editor to set up roles, listings, consultations, RLS, and activity logging.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'user' check (role in ('user', 'owner')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'owner'
  );
$$;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.is_owner() to anon;

revoke all on public.profiles from anon, authenticated, public;
drop policy if exists "Users can read their own profile and owners can read all profiles" on public.profiles;
create policy "Users can read their own profile and owners can read all profiles"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_owner()));

grant select on public.profiles to authenticated;

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

insert into public.profiles (id, full_name)
select id, coalesce(raw_user_meta_data ->> 'full_name', '')
from auth.users
on conflict (id) do nothing;

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  property_type text not null check (property_type in ('Apartment', 'Detached house', 'Terrace', 'Land')),
  transaction_type text not null check (transaction_type in ('Buy', 'Rent', 'Short Let', 'Land')),
  location text not null,
  price numeric(14, 2) not null check (price > 0),
  bedrooms integer not null default 0 check (bedrooms >= 0),
  description text not null default '',
  image_url text not null check (image_url ~ '^https://'),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.listings enable row level security;
create index if not exists listings_published_created_at_idx
  on public.listings (created_at desc) where is_published;

revoke all on public.listings from anon, authenticated, public;
drop policy if exists "Anyone can read published listings" on public.listings;
create policy "Anyone can read published listings"
  on public.listings for select to anon, authenticated
  using (is_published or (select public.is_owner()));

drop policy if exists "Owners can insert listings" on public.listings;
create policy "Owners can insert listings"
  on public.listings for insert to authenticated
  with check ((select public.is_owner()));

drop policy if exists "Owners can update listings" on public.listings;
create policy "Owners can update listings"
  on public.listings for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

drop policy if exists "Owners can delete listings" on public.listings;
create policy "Owners can delete listings"
  on public.listings for delete to authenticated
  using ((select public.is_owner()));

grant select on public.listings to anon, authenticated;
grant insert, update, delete on public.listings to authenticated;

create table if not exists public.owner_activity (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  listing_title text not null,
  created_at timestamptz not null default now()
);

alter table public.owner_activity enable row level security;
create index if not exists owner_activity_created_at_idx
  on public.owner_activity (created_at desc);

revoke all on public.owner_activity from anon, authenticated, public;
drop policy if exists "Owners can read activity" on public.owner_activity;
create policy "Owners can read activity"
  on public.owner_activity for select to authenticated
  using ((select public.is_owner()));

grant select on public.owner_activity to authenticated;

create table if not exists public.consultation_requests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(trim(first_name)) between 1 and 100),
  last_name text not null check (length(trim(last_name)) between 1 and 100),
  email text not null check (length(email) <= 254 and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  phone text not null check (length(phone) between 7 and 40),
  interest text not null check (interest in (
    'Buying a property',
    'Renting a property',
    'Short let',
    'Land',
    'Investment',
    'Other enquiry'
  )),
  message text not null check (length(trim(message)) between 1 and 4000),
  created_at timestamptz not null default now()
);

alter table public.consultation_requests enable row level security;
create index if not exists consultation_requests_created_at_idx
  on public.consultation_requests (created_at desc);

revoke all on public.consultation_requests from anon, authenticated, public, service_role;
drop policy if exists "Owners can read consultation requests" on public.consultation_requests;
create policy "Owners can read consultation requests"
  on public.consultation_requests for select to authenticated
  using ((select public.is_owner()));

grant insert on public.consultation_requests to service_role;
grant select on public.consultation_requests to authenticated;

create or replace function public.record_listing_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.owner_activity (actor_id, action, listing_title)
    values (auth.uid(), 'deleted', old.title);
    return old;
  end if;

  insert into public.owner_activity (actor_id, listing_id, action, listing_title)
  values (
    auth.uid(),
    new.id,
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    new.title
  );
  return new;
end;
$$;

revoke all on function public.record_listing_activity() from public;

drop trigger if exists listing_activity_log on public.listings;
create trigger listing_activity_log
  after insert or update or delete on public.listings
  for each row execute function public.record_listing_activity();

create or replace function public.set_listing_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists listings_updated_at on public.listings;
create trigger listings_updated_at
  before update on public.listings
  for each row execute function public.set_listing_updated_at();

-- After creating your account, grant owner access with an administrator account:
-- update public.profiles set role = 'owner' where id = (
--   select id from auth.users where email = 'your-owner-email@example.com'
-- );
