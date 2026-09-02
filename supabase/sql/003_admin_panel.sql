-- ChipaWAT — paso 3: datos que necesita el panel de admin
-- Requiere haber corrido antes 001_auth_profiles_groups.sql y 002_admin.sql
-- Pegar y ejecutar completo en Supabase → SQL Editor → New query → Run.

-- El navegador NO puede leer la tabla auth.users (ahí viven los emails).
-- Por eso hacemos una función que los devuelve, pero solo si quien la llama
-- es admin. Así el panel puede mostrar "Nombre — email" sin exponerle los
-- emails de todas a cualquier usuaria logueada.
create or replace function public.admin_list_users()
returns table (
  id uuid,
  name text,
  color text,
  is_admin boolean,
  email text,
  created_at timestamptz
)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo una admin puede ver el listado de usuarias.';
  end if;

  return query
    select p.id, p.name, p.color, p.is_admin, u.email::text, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.name;
end;
$$;
