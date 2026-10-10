-- Emergency Radar · contador de visitas
-- ------------------------------------------------------------------
-- Ejecuta este archivo en Supabase (SQL Editor → New query → Run). Se puede volver a
-- ejecutar sin perder datos: solo crea lo que falta y actualiza las funciones.
--
-- Cómo cuenta:
--   * La IP se toma del encabezado x-forwarded-for que pone Supabase, en el servidor,
--     así que el navegador no puede inventarla.
--   * No se guarda la IP: se guarda su huella SHA-256 con una sal secreta. Sirve para
--     reconocer al mismo visitante sin conservar un dato personal.
--   * Una misma IP vuelve a contar como visita nueva solo después de 6 horas. Recargar
--     la página o volver al rato no suma.
--   * País y ciudad son aproximados: llegan del navegador (servicio de geolocalización)
--     o, si faltan, del encabezado cf-ipcountry.
--
-- La tabla no tiene políticas de acceso: con la clave pública (anon) nadie puede leerla
-- ni escribirla directamente. Solo se usan las dos funciones de abajo.

create extension if not exists pgcrypto;

create table if not exists public.visitas (
  id bigint generated always as identity primary key,
  huella text not null,
  pais_codigo text,
  ciudad text,
  creado timestamptz not null default now(),
  ultima timestamptz not null default now()
);
create index if not exists visitas_huella_idx on public.visitas (huella, ultima desc);
create index if not exists visitas_creado_idx on public.visitas (creado desc);
alter table public.visitas enable row level security;

create table if not exists public.visitas_config (
  id int primary key default 1 check (id = 1),
  sal text not null default encode(gen_random_bytes(24), 'hex')
);
insert into public.visitas_config (id) values (1) on conflict (id) do nothing;
alter table public.visitas_config enable row level security;

-- Resumen público: totales y últimas visitas (sin huellas ni IP).
create or replace function public.resumen_visitas()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'total', (select count(*) from visitas),
    'hoy', (select count(*) from visitas where creado >= now() - interval '24 hours'),
    'paises', (select count(distinct pais_codigo) from visitas where pais_codigo is not null),
    'top', coalesce((
      select json_agg(t) from (
        select pais_codigo as codigo, count(*) as n
        from visitas where pais_codigo is not null
        group by pais_codigo order by n desc limit 6
      ) t), '[]'::json),
    'recientes', coalesce((
      select json_agg(r) from (
        select pais_codigo as codigo, ciudad, ultima as fecha
        from visitas order by ultima desc limit 8
      ) r), '[]'::json)
  );
$$;

-- Registra la visita (si corresponde) y devuelve el resumen.
create or replace function public.registrar_visita(p_codigo text default null, p_ciudad text default null)
returns json
language plpgsql
volatile
security definer
-- En Supabase, pgcrypto (digest) vive en el esquema "extensions".
set search_path = public, extensions
as $$
declare
  hdrs json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  ip text := trim(split_part(coalesce(hdrs->>'x-forwarded-for', hdrs->>'x-real-ip', ''), ',', 1));
  v_codigo text := upper(left(coalesce(nullif(trim(p_codigo), ''), hdrs->>'cf-ipcountry'), 2));
  v_ciudad text := nullif(left(trim(coalesce(p_ciudad, '')), 80), '');
  h text;
  previa record;
  nueva boolean := false;
begin
  if ip = '' then
    return (json_build_object('nueva', false)::jsonb || resumen_visitas()::jsonb)::json;
  end if;
  if v_codigo !~ '^[A-Z]{2}$' or v_codigo in ('XX', 'T1') then v_codigo := null; end if;
  h := encode(digest(ip || (select sal from visitas_config where id = 1), 'sha256'), 'hex');

  select id, ultima into previa from visitas where huella = h order by ultima desc limit 1;
  if previa.id is null or previa.ultima < now() - interval '6 hours' then
    insert into visitas (huella, pais_codigo, ciudad) values (h, v_codigo, v_ciudad);
    nueva := true;
  else
    update visitas set ultima = now(),
      pais_codigo = coalesce(visitas.pais_codigo, v_codigo),
      ciudad = coalesce(visitas.ciudad, v_ciudad)
    where id = previa.id;
  end if;

  return (json_build_object('nueva', nueva)::jsonb || resumen_visitas()::jsonb)::json;
end;
$$;

revoke all on function public.registrar_visita(text, text) from public;
revoke all on function public.resumen_visitas() from public;
grant execute on function public.registrar_visita(text, text) to anon, authenticated;
grant execute on function public.resumen_visitas() to anon, authenticated;
