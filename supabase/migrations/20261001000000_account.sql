-- P8-16 · Account: does the signed-in host have a password yet?
--
-- Hosts who signed up with Google have no password until they set one on /account. Those
-- who have one must type it before changing it. Supabase's identities list doesn't say this
-- reliably (setting a password doesn't add an "email" identity), so ask auth.users.

create function public.account_has_password()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.encrypted_password is not null and u.encrypted_password <> ''
       from auth.users u
      where u.id = (select auth.uid())),
    false
  )
$$;

revoke all on function public.account_has_password() from public, anon;
grant execute on function public.account_has_password() to authenticated;
