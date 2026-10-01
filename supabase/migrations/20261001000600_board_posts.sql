-- =============================================================================
-- Escuela Visible — Tablón: publicaciones de las escuelas
--
--  1. Tipos y tabla board_posts (sin imágenes, sin enlaces a necesidades).
--  2. Protección de privacidad: títulos y textos sin teléfonos ni correos
--     (CHECK a nivel de tabla: aplica a TODA escritura, incluida la secret key).
--  3. Guards: una publicación nueva empieza en pending_review; solo se permite
--     pending_review → published | rejected; el contenido no se edita después
--     de enviarlo.
--  4. RLS: el público solo ve lo publicado; la escuela ve las suyas; el admin
--     ve todas. created_by y reviewed_by no son legibles con anon/authenticated.
--  5. RPC board_*: validan actor, rol, escuela y estado. Solo las ejecuta
--     service_role (servidor con secret key); el navegador nunca escribe.
--
-- Las publicaciones NO generan eventos ni se publican en Hedera.
-- No modifica tablas, políticas ni funciones existentes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipos y tabla
-- -----------------------------------------------------------------------------
create type public.board_post_kind as enum (
  'bazar',
  'sancocho',
  'actividad',
  'mejora_infraestructura',
  'materiales_escolares',
  'campana',
  'proyecto_terminado'
);

-- Escuela publica → pending_review → admin aprueba (published) o no (rejected).
create type public.board_post_status as enum ('pending_review', 'published', 'rejected');

-- -----------------------------------------------------------------------------
-- 2. Privacidad: ¿el texto contiene un correo o un número de teléfono?
--    Teléfono = 7 o más dígitos seguidos, admitiendo un separador (espacio,
--    punto, guion o paréntesis) entre dígitos; antes se descartan las fechas
--    (2026-10-15, 15/10/2026, 15-10-26). La misma regla está en
--    src/lib/domain/contact-data.ts (mensajes claros en la interfaz); la base
--    de datos es la autoridad final.
-- -----------------------------------------------------------------------------
create or replace function public.board_text_has_contact(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_text ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
    or regexp_replace(
         p_text,
         '\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}',
         ' ',
         'g'
       ) ~ '\d([[:space:].()-]?\d){6,}',
    false
  );
$$;

create table public.board_posts (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools (id) on delete restrict,
  kind         public.board_post_kind not null,
  title        text not null check (char_length(title) between 3 and 120),
  body         text not null default '' check (char_length(body) <= 2000),
  event_date   date,
  status       public.board_post_status not null default 'pending_review',
  created_by   uuid references public.profiles (id) on delete set null,
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint board_posts_no_contact_data check (
    not public.board_text_has_contact(title) and not public.board_text_has_contact(body)
  )
);

create index board_posts_school_id_idx on public.board_posts (school_id);
create index board_posts_published_idx on public.board_posts (status, published_at desc);

create trigger board_posts_updated_at before update on public.board_posts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Guards de estado y de contenido
-- -----------------------------------------------------------------------------
create or replace function public.enforce_board_post_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending_review' then
      raise exception 'INVALID_TRANSITION: una publicación nueva debe empezar en pending_review (recibido %)', new.status
        using errcode = 'P0001', hint = 'INVALID_TRANSITION';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     and (old.status::text, new.status::text) not in (
       ('pending_review', 'published'),
       ('pending_review', 'rejected')
     ) then
    raise exception 'INVALID_TRANSITION: transición de publicación no permitida: % → %', old.status, new.status
      using errcode = 'P0001', hint = 'INVALID_TRANSITION';
  end if;

  -- Sin edición después de enviar: el contenido y la autoría no cambian.
  if (new.school_id, new.kind, new.title, new.body, new.event_date, new.created_by, new.created_at)
     is distinct from
     (old.school_id, old.kind, old.title, old.body, old.event_date, old.created_by, old.created_at) then
    raise exception 'INVALID_TRANSITION: el contenido de una publicación no se puede modificar'
      using errcode = 'P0001', hint = 'INVALID_TRANSITION';
  end if;
  return new;
end;
$$;

create trigger board_posts_rules_guard
  before insert or update on public.board_posts
  for each row execute function public.enforce_board_post_rules();

-- -----------------------------------------------------------------------------
-- 4. RLS y permisos de columnas
-- -----------------------------------------------------------------------------
alter table public.board_posts enable row level security;

-- Públicas solo cuando están publicadas. La escuela ve también las suyas
-- pendientes o no aprobadas; el admin ve todas. Sin políticas de escritura.
create policy "board_posts: lectura según estado y rol"
  on public.board_posts for select
  to anon, authenticated
  using (
    status = 'published'
    or (select public.current_user_role()) = 'admin'
    or (
      (select public.current_user_role()) = 'school_rep'
      and school_id = (select public.current_user_school_id())
    )
  );

-- El navegador nunca escribe: sin INSERT/UPDATE/DELETE para anon/authenticated
-- (además de no haber políticas de escritura).
revoke all on table public.board_posts from anon, authenticated;

-- Lectura solo de columnas sin identificadores de personas.
grant select (
  id,
  school_id,
  kind,
  title,
  body,
  event_date,
  status,
  reviewed_at,
  published_at,
  created_at,
  updated_at
) on table public.board_posts to anon, authenticated;
-- Protegidas (sin SELECT para anon/authenticated): created_by, reviewed_by.

-- -----------------------------------------------------------------------------
-- 5. RPC del tablón (reutilizan flow_fail y flow_get_actor)
-- -----------------------------------------------------------------------------

-- La escuela envía una publicación: queda pendiente de revisión.
create or replace function public.board_create_post(
  p_actor_id   uuid,
  p_post_id    uuid,
  p_school_id  uuid,
  p_kind       public.board_post_kind,
  p_title      text,
  p_body       text,
  p_event_date date
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor public.profiles := public.flow_get_actor(p_actor_id);
begin
  if v_actor.role <> 'school_rep' then
    perform public.flow_fail('FORBIDDEN_ROLE', 'Solo el representante de la escuela puede publicar en el tablón.');
  end if;
  if v_actor.school_id is distinct from p_school_id then
    perform public.flow_fail('NOT_SCHOOL_MEMBER', 'Solo puedes publicar para tu propia escuela.');
  end if;
  if public.board_text_has_contact(p_title) or public.board_text_has_contact(coalesce(p_body, '')) then
    perform public.flow_fail('CONTACT_DATA', 'No incluyas teléfonos ni correos electrónicos en la publicación.');
  end if;

  insert into public.board_posts (id, school_id, kind, title, body, event_date, created_by)
  values (p_post_id, p_school_id, p_kind, p_title, coalesce(p_body, ''), p_event_date, p_actor_id);

  return jsonb_build_object('postId', p_post_id, 'postStatus', 'pending_review');
end;
$$;

-- El admin aprueba: pending_review → published (desde ahora es pública).
create or replace function public.board_publish_post(
  p_actor_id uuid,
  p_post_id  uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor public.profiles := public.flow_get_actor(p_actor_id);
  v_post  public.board_posts;
begin
  if v_actor.role <> 'admin' then
    perform public.flow_fail('FORBIDDEN_ROLE', 'Solo la administración de la plataforma puede revisar publicaciones.');
  end if;

  select * into v_post from public.board_posts where id = p_post_id for update;
  if not found then
    perform public.flow_fail('NOT_FOUND', 'La publicación no existe.');
  end if;
  if v_post.status <> 'pending_review' then
    perform public.flow_fail('INVALID_TRANSITION', 'Esta publicación no está pendiente de revisión.');
  end if;

  update public.board_posts
     set status = 'published', reviewed_by = p_actor_id, reviewed_at = now(), published_at = now()
   where id = p_post_id;

  return jsonb_build_object('postId', p_post_id, 'postStatus', 'published');
end;
$$;

-- El admin no aprueba: pending_review → rejected (nunca es pública).
create or replace function public.board_reject_post(
  p_actor_id uuid,
  p_post_id  uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor public.profiles := public.flow_get_actor(p_actor_id);
  v_post  public.board_posts;
begin
  if v_actor.role <> 'admin' then
    perform public.flow_fail('FORBIDDEN_ROLE', 'Solo la administración de la plataforma puede revisar publicaciones.');
  end if;

  select * into v_post from public.board_posts where id = p_post_id for update;
  if not found then
    perform public.flow_fail('NOT_FOUND', 'La publicación no existe.');
  end if;
  if v_post.status <> 'pending_review' then
    perform public.flow_fail('INVALID_TRANSITION', 'Esta publicación no está pendiente de revisión.');
  end if;

  update public.board_posts
     set status = 'rejected', reviewed_by = p_actor_id, reviewed_at = now()
   where id = p_post_id;

  return jsonb_build_object('postId', p_post_id, 'postStatus', 'rejected');
end;
$$;

-- Permisos: las board_* solo desde el servidor (service_role), como las flow_*.
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'board\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
