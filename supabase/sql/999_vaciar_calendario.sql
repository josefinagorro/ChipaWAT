-- ChipaWAT — vaciar el calendario (uso puntual, no es parte de la migración 008)
-- Corré esto en Supabase → SQL Editor si querés asegurarte de que el calendario
-- arranca sin ningún acontecimiento cargado. Las tablas de responsables y
-- participantes se vacían solas por el "on delete cascade".

delete from public.group_calendar_events;
delete from public.personal_calendar_events;

-- Chequeo: las dos consultas de abajo tienen que devolver 0 filas.
-- select count(*) from public.personal_calendar_events;
-- select count(*) from public.group_calendar_events;
