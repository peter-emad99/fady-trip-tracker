-- Admin-only data for the "Download backup" button on the Usage page.
-- Run AFTER 20261010000000_migrate_receipts.sql. Creates one function, no tables.

create or replace function public.get_receipt_backup_index()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can download backups' using errcode = '42501';
  end if;

  return json_build_object(
    'expenses', (
      select coalesce(json_agg(
        to_jsonb(e) || jsonb_build_object('trip_name', t.name, 'trip_start_date', t.start_date)
        order by t.name, e.date
      ), '[]'::json)
      from public.expenses e
      left join public.trips t on t.id::text = e.trip_id::text
    ),
    'supabase_files', (
      select coalesce(json_agg(o.name order by o.name), '[]'::json)
      from storage.objects o
      where o.bucket_id = 'receipts'
    )
  );
end;
$$;

revoke execute on function public.get_receipt_backup_index() from public, anon;
grant execute on function public.get_receipt_backup_index() to authenticated;
