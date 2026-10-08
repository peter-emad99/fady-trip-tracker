-- Categories: close the "allow all" hole and lock categories that expenses already use.
-- Applied 2026-10-08 (run in the Supabase SQL editor).

-- This policy let anyone (even signed-out visitors with the public key) change or delete any category.
drop policy if exists "Allow all for categories" on public.categories;

-- Remaining policies (unchanged):
--   "Users can manage their own categories"  ALL     auth.uid() = user_id   (so anyone signed in can add their own)
--   "Users can read public categories"       SELECT  user_id is null        (the shared "system" categories)

-- Admins can recolour the shared categories (the app only changes their colour)
drop policy if exists "Admins can update shared categories" on public.categories;
create policy "Admins can update shared categories" on public.categories
  for update to authenticated
  using (user_id is null and public.is_admin())
  with check (user_id is null and public.is_admin());

-- Expenses store the category by name, so renaming or deleting a category in use would cut them off.
-- Once any expense uses a category it can't be renamed or deleted (its colour can still change).
-- Shared categories count every user's expenses; personal ones count only the owner's.
create or replace function public.prevent_used_category_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or new.name is distinct from old.name then
    if exists (
      select 1 from public.expenses e
      where e.category = old.name
        and (old.user_id is null or e.user_id = old.user_id)
    ) then
      raise exception 'Category "%" is used by expenses, so it can''t be renamed or deleted', old.name
        using errcode = 'P0001';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists categories_lock_when_used on public.categories;
create trigger categories_lock_when_used
  before update or delete on public.categories
  for each row execute function public.prevent_used_category_change();
