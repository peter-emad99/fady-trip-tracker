-- Admin flag for restricting the Usage page.
-- Run AFTER 20261008000000_usage_stats.sql, in the Supabase SQL editor (or via `supabase db push`).
-- To make someone an admin: Table Editor -> profiles -> tick is_admin on their row.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users may read their own row only. No insert/update policies, so nobody can
-- make themselves admin from the app; edit is_admin from the Supabase dashboard.
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

-- Create a profile row for every new sign-up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill existing users
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select is_admin from public.profiles where id = (select auth.uid())),
    false
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Usage stats are admin-only from now on
create or replace function public.get_usage_stats()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  tables json;
  buckets json;
  tbl record;
  row_counts jsonb := '{}'::jsonb;
  cnt bigint;
begin
  if not public.is_admin() then
    raise exception 'Only admins can view usage stats' using errcode = '42501';
  end if;

  -- Exact row counts (tables are small, so count(*) is cheap)
  for tbl in
    select relname from pg_catalog.pg_stat_user_tables where schemaname = 'public'
  loop
    execute format('select count(*) from public.%I', tbl.relname) into cnt;
    row_counts := row_counts || jsonb_build_object(tbl.relname, cnt);
  end loop;

  select coalesce(json_agg(t order by t.total_bytes desc), '[]'::json) into tables
  from (
    select
      s.relname as name,
      (row_counts ->> s.relname)::bigint as rows,
      pg_catalog.pg_total_relation_size(s.relid) as total_bytes
    from pg_catalog.pg_stat_user_tables s
    where s.schemaname = 'public'
  ) t;

  select coalesce(json_agg(b order by b.bytes desc), '[]'::json) into buckets
  from (
    select
      o.bucket_id as name,
      count(*) as objects,
      coalesce(sum((o.metadata ->> 'size')::bigint), 0) as bytes
    from storage.objects o
    group by o.bucket_id
  ) b;

  return json_build_object(
    'db_size_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'tables', tables,
    'storage_buckets', buckets
  );
end;
$$;
