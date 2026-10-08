-- Helpers for moving old Supabase Storage receipts to Google Drive (Usage page button).
-- Run AFTER 20261009000000_admin_profiles.sql. Both functions are admin-only.

-- Every (expense, receipt URL) pair that still points at the Supabase "receipts" bucket.
create or replace function public.list_legacy_receipts()
returns table (expense_id text, url text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can migrate receipts' using errcode = '42501';
  end if;

  return query
  select distinct e.id::text, u.url
  from public.expenses e
  cross join lateral (
    select x as url
    from jsonb_array_elements_text(
      case when jsonb_typeof(to_jsonb(e.receipt_urls)) = 'array' then to_jsonb(e.receipt_urls) else '[]'::jsonb end
    ) x
    union
    select e.receipt_url where e.receipt_url is not null
  ) u
  where u.url like '%/storage/v1/object/public/receipts/%';
end;
$$;

-- Swaps one receipt URL for another on an expense (in receipt_urls and the legacy receipt_url).
-- Works whether receipt_urls is text[] or json/jsonb.
create or replace function public.replace_receipt_url(p_expense_id text, p_old_url text, p_new_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  col_type text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can migrate receipts' using errcode = '42501';
  end if;

  -- Plain assignment on purpose: the Supabase SQL editor misreads the other form of this query
  col_type := (
    select c.data_type
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'expenses' and c.column_name = 'receipt_urls'
  );

  if col_type in ('json', 'jsonb') then
    execute format(
      'update public.expenses
         set receipt_urls = (
           select coalesce(jsonb_agg(case when t.x = $2 then $3 else t.x end order by t.ord), ''[]''::jsonb)
           from jsonb_array_elements_text(receipt_urls::jsonb) with ordinality as t(x, ord)
         )::%s
         where id::text = $1 and jsonb_typeof(receipt_urls::jsonb) = ''array''',
      col_type
    ) using p_expense_id, p_old_url, p_new_url;
  elsif col_type is not null then
    update public.expenses
    set receipt_urls = array_replace(receipt_urls, p_old_url, p_new_url)
    where id::text = p_expense_id;
  end if;

  update public.expenses
  set receipt_url = p_new_url
  where id::text = p_expense_id and receipt_url = p_old_url;
end;
$$;

revoke execute on function public.list_legacy_receipts() from public, anon;
revoke execute on function public.replace_receipt_url(text, text, text) from public, anon;
grant execute on function public.list_legacy_receipts() to authenticated;
grant execute on function public.replace_receipt_url(text, text, text) to authenticated;
