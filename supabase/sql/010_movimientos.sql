-- ChipaWAT — paso 10: de "gastos" a "movimientos" (plata que entra y que sale)
-- Requiere 001 a 009 corridos antes.
-- Pegar y ejecutar completo en Supabase → SQL Editor → New query → Run.
--
-- Qué cambia:
--   1. personal_expenses pasa a llamarse personal_movements y gana una columna
--      `kind`: 'expense' (gasto) o 'income' (ingreso). Los gastos que ya tenías
--      cargados quedan como 'expense', no se pierde nada.
--   2. Nace group_settlements: cuando alguien marca "ya te transferí", queda
--      guardado en la base en vez de perderse al recargar la página.
--   3. Nace my_money_balance(): una sola función que devuelve cuánta plata te
--      queda, cruzando lo personal con lo grupal.

-- ============================================================
-- 1. personal_expenses → personal_movements
-- ============================================================
-- El rename conserva las filas, los ids y las foreign keys. Si por algún
-- motivo corrés este archivo dos veces, el `if` de abajo hace que la segunda
-- vez no haga nada en vez de explotar.

do $$
begin
  if to_regclass('public.personal_expenses') is not null
     and to_regclass('public.personal_movements') is null then
    alter table public.personal_expenses rename to personal_movements;
  end if;
end $$;

-- Por si alguien arranca de cero y nunca corrió el paso 6.
create table if not exists public.personal_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  description text not null,
  category text not null default 'Otros',
  amount_cents integer not null check (amount_cents > 0),
  spent_on date not null,
  created_at timestamptz not null default now()
);

-- El monto SIEMPRE se guarda positivo. Lo que decide si suma o resta es `kind`.
-- Guardar ingresos en positivo y gastos en negativo parece más cómodo, pero
-- después cualquier "cuánto gasté este mes" tiene que acordarse de invertir el
-- signo, y alcanza con olvidarse una vez para que los totales queden mal.
alter table public.personal_movements
  add column if not exists kind text not null default 'expense';

alter table public.personal_movements
  drop constraint if exists personal_movements_kind_check;

alter table public.personal_movements
  add constraint personal_movements_kind_check check (kind in ('expense', 'income'));

alter index if exists public.personal_expenses_user_idx
  rename to personal_movements_user_idx;

create index if not exists personal_movements_user_idx
  on public.personal_movements (user_id, spent_on desc);

-- ============================================================
-- 2. RLS de personal_movements
-- ============================================================
-- Mismo criterio de siempre: cada una ve y toca SOLO lo suyo, y acá tampoco
-- hay bypass de admin global. Que exista un rol de admin en la app no es
-- motivo para que alguien vea cuánta plata gana o gasta otra persona.
-- Las policies viejas se llamaban "personal_expenses: ...": el rename de la
-- tabla no les cambia el nombre, así que las damos de baja a mano.

alter table public.personal_movements enable row level security;

drop policy if exists "personal_expenses: ver los propios" on public.personal_movements;
drop policy if exists "personal_expenses: cargar los propios" on public.personal_movements;
drop policy if exists "personal_expenses: editar los propios" on public.personal_movements;
drop policy if exists "personal_expenses: borrar los propios" on public.personal_movements;

drop policy if exists "personal_movements: ver los propios" on public.personal_movements;
create policy "personal_movements: ver los propios"
  on public.personal_movements for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "personal_movements: cargar los propios" on public.personal_movements;
create policy "personal_movements: cargar los propios"
  on public.personal_movements for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "personal_movements: editar los propios" on public.personal_movements;
create policy "personal_movements: editar los propios"
  on public.personal_movements for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "personal_movements: borrar los propios" on public.personal_movements;
create policy "personal_movements: borrar los propios"
  on public.personal_movements for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 3. Transferencias saldadas entre integrantes
-- ============================================================
-- Hasta ahora "marcar como pagado" vivía solo en la memoria del navegador: se
-- perdía al recargar. Y no se podía guardar con el id que usaba la pantalla
-- ("de-quien-a-quien-cuanto"), porque ese id cambia cada vez que cambia el
-- monto de la deuda.
--
-- La solución es al revés: en vez de guardar "esta deuda está saldada",
-- guardamos el PAGO que de verdad ocurrió. Un pago es un hecho que no cambia
-- nunca, y la deuda pendiente pasa a ser una cuenta: lo que debés menos lo que
-- ya transferiste.

create table if not exists public.group_settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  settled_on date not null default current_date,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint group_settlements_distinct_people check (from_user <> to_user)
);

create index if not exists group_settlements_group_idx
  on public.group_settlements (group_id, settled_on desc);

alter table public.group_settlements enable row level security;

drop policy if exists "group_settlements: los del grupo" on public.group_settlements;
create policy "group_settlements: los del grupo"
  on public.group_settlements for select
  to authenticated
  using (public.is_group_member(group_settlements.group_id));

-- Borrar = "me equivoqué, esa transferencia no pasó". Cualquier integrante
-- puede hacerlo, igual que con los gastos: es una libreta compartida.
drop policy if exists "group_settlements: borrar los del grupo" on public.group_settlements;
create policy "group_settlements: borrar los del grupo"
  on public.group_settlements for delete
  to authenticated
  using (public.is_group_member(group_settlements.group_id));

-- El alta va por RPC (no hay policy de insert) para que la base valide que las
-- dos personas son del grupo. Mismo patrón que save_group_expense.
create or replace function public.record_group_settlement(
  p_group_id uuid,
  p_from_user uuid,
  p_to_user uuid,
  p_amount_cents integer,
  p_settled_on date default current_date
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'No sos integrante de este grupo';
  end if;

  if p_from_user = p_to_user then
    raise exception 'Una transferencia necesita dos personas distintas';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'El monto de la transferencia tiene que ser mayor a cero';
  end if;

  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = p_from_user
  ) then
    raise exception 'Quien paga no es integrante del grupo';
  end if;

  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = p_to_user
  ) then
    raise exception 'Quien recibe no es integrante del grupo';
  end if;

  insert into public.group_settlements (group_id, from_user, to_user, amount_cents, settled_on)
  values (p_group_id, p_from_user, p_to_user, p_amount_cents, coalesce(p_settled_on, current_date))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.record_group_settlement(uuid, uuid, uuid, integer, date) to authenticated;

-- ============================================================
-- 4. Cuánta plata te queda: my_money_balance()
-- ============================================================
-- Esta es la cuenta que se ve arriba de todo en la pantalla de Movimientos.
-- La idea es una sola: seguir la plata de verdad, la que sale y entra de tu
-- bolsillo, sin importar si el gasto era personal o del grupo.
--
--   + ingresos personales
--   - gastos personales
--   - TODO lo que adelantaste vos en el grupo (gastos grupales y alquileres
--     donde figurás como quien pagó; se resta el total, no tu parte)
--   + lo que las demás ya te transferieron de vuelta
--   - lo que vos ya le transferiste a las demás
--
-- Ejemplo de Josefina: cargás $1000 de ingreso, gastás $100 en una coca
-- (personal) y ponés $500 del papel higiénico del grupo (entre 4). Te quedan
-- $400 en la mano. A medida que cada una de las otras tres marca que te
-- transfirió sus $125, el saldo vuelve a subir hasta $775, que es lo que
-- realmente te costó todo.
--
-- Las "partes" del alquiler se reparten igual que en el frontend (splitEvenly):
-- si no divide exacto, los centavos sobrantes le tocan a las primeras
-- participantes ordenadas por id, siempre a las mismas. Así los totales no
-- bailan entre una recarga y otra.

create or replace function public.my_money_balance()
returns table (
  income_cents bigint,
  personal_expense_cents bigint,
  group_paid_cents bigint,
  received_cents bigint,
  sent_cents bigint,
  balance_cents bigint
)
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_income bigint := 0;
  v_personal bigint := 0;
  v_expenses_paid bigint := 0;
  v_rent_paid bigint := 0;
  v_received bigint := 0;
  v_sent bigint := 0;
  v_rent_received bigint := 0;
  v_rent_sent bigint := 0;
begin
  if v_me is null then
    raise exception 'Necesitás iniciar sesión';
  end if;

  -- Personal
  select
    coalesce(sum(pm.amount_cents) filter (where pm.kind = 'income'), 0),
    coalesce(sum(pm.amount_cents) filter (where pm.kind = 'expense'), 0)
  into v_income, v_personal
  from public.personal_movements pm
  where pm.user_id = v_me;

  -- Gastos del grupo que adelantaste vos
  select coalesce(sum(ge.amount_cents), 0)
  into v_expenses_paid
  from public.group_expenses ge
  where ge.paid_by = v_me;

  -- Alquileres que adelantaste vos
  select coalesce(sum(rm.total_cents), 0)
  into v_rent_paid
  from public.rent_months rm
  where rm.paid_by = v_me;

  -- Transferencias ya registradas entre integrantes
  select coalesce(sum(gs.amount_cents), 0)
  into v_received
  from public.group_settlements gs
  where gs.to_user = v_me;

  select coalesce(sum(gs.amount_cents), 0)
  into v_sent
  from public.group_settlements gs
  where gs.from_user = v_me;

  -- Cuotas de alquiler tildadas como pagadas (son plata que se movió de verdad)
  with rent_shares as (
    select
      rp.user_id,
      rp.status,
      rm.paid_by,
      rm.total_cents / count(*) over (partition by rp.rent_month_id)
        + case
            when row_number() over (partition by rp.rent_month_id order by rp.user_id)
                 <= rm.total_cents % count(*) over (partition by rp.rent_month_id)
            then 1
            else 0
          end as share_cents
    from public.rent_payments rp
    join public.rent_months rm on rm.id = rp.rent_month_id
  )
  select
    coalesce(sum(share_cents) filter (
      where paid_by = v_me and user_id <> v_me and status = 'paid'
    ), 0),
    coalesce(sum(share_cents) filter (
      where user_id = v_me and paid_by <> v_me and status = 'paid'
    ), 0)
  into v_rent_received, v_rent_sent
  from rent_shares;

  income_cents := v_income;
  personal_expense_cents := v_personal;
  group_paid_cents := v_expenses_paid + v_rent_paid;
  received_cents := v_received + v_rent_received;
  sent_cents := v_sent + v_rent_sent;
  balance_cents := income_cents - personal_expense_cents - group_paid_cents
                   + received_cents - sent_cents;

  return next;
end;
$$;

grant execute on function public.my_money_balance() to authenticated;

-- ============================================================
-- 5. Chequeo rápido
-- ============================================================
-- Después de cargar un ingreso desde la app, esto tiene que mostrarlo:

-- select kind, description, amount_cents / 100.0 as monto, spent_on
-- from public.personal_movements
-- order by spent_on desc;

-- Y esto tiene que devolver una sola fila con tu saldo:

-- select * from public.my_money_balance();
