-- ChipaWAT — paso 6: gastos personales de verdad (chau datos de prueba)
-- Requiere 001 a 005 corridos antes.
-- Pegar y ejecutar completo en Supabase → SQL Editor → New query → Run.

-- ============================================================
-- 1. La tabla
-- ============================================================
-- Sobre el monto: se guarda en CENTAVOS, como número entero.
-- Si usáramos decimales, 0.1 + 0.2 no da exactamente 0.3 en la compu y
-- con el tiempo los totales empiezan a fallar por centavos. Guardando
-- 13800 en vez de 138.00 las cuentas siempre cierran. El frontend ya
-- trabajaba así (amountCents), así que coincide.

create table if not exists public.personal_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  description text not null,
  category text not null default 'Otros',
  amount_cents integer not null check (amount_cents > 0),
  spent_on date not null,
  created_at timestamptz not null default now()
);

create index if not exists personal_expenses_user_idx
  on public.personal_expenses (user_id, spent_on desc);

-- ============================================================
-- 2. RLS: cada una ve y toca SOLO lo suyo
-- ============================================================
-- Ojo con algo a propósito: acá NO hay bypass de admin global.
-- Un gasto personal es privado, y que exista un rol de admin en la app
-- no es motivo para que alguien pueda leer en qué gastan las demás.
-- Ni siquiera vos como admin ves esta tabla desde la app.

alter table public.personal_expenses enable row level security;

drop policy if exists "personal_expenses: ver los propios" on public.personal_expenses;
create policy "personal_expenses: ver los propios"
  on public.personal_expenses for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "personal_expenses: cargar los propios" on public.personal_expenses;
create policy "personal_expenses: cargar los propios"
  on public.personal_expenses for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "personal_expenses: editar los propios" on public.personal_expenses;
create policy "personal_expenses: editar los propios"
  on public.personal_expenses for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "personal_expenses: borrar los propios" on public.personal_expenses;
create policy "personal_expenses: borrar los propios"
  on public.personal_expenses for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 3. Chequeo rápido
-- ============================================================
-- Después de cargar un gasto desde la app, esto tiene que mostrarlo:

-- select description, category, amount_cents / 100.0 as monto, spent_on
-- from public.personal_expenses
-- order by spent_on desc;
