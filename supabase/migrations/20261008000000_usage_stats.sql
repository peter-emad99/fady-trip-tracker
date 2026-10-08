-- Returns database and storage usage for the in-app Usage page.
-- Run this once in the Supabase SQL editor (or via `supabase db push`).

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

revoke execute on function public.get_usage_stats() from public, anon;
grant execute on function public.get_usage_stats() to authenticated;
