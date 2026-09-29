-- =============================================================================
-- Escuela Visible — RLS, vistas y storage
--
-- Modelo de seguridad del MVP:
--   * Lecturas: RLS define qué ve cada rol (anon incluido).
--   * Escrituras: NO hay políticas de insert/update/delete para anon ni
--     authenticated. Todas las escrituras pasan por Server Actions que validan
--     rol y transición de estado, y usan la secret key (que salta RLS).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers (security definer para evitar recursión en las políticas de profiles)
-- -----------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select school_id from public.profiles where id = auth.uid();
$$;

-- anon también las necesita: las políticas de lectura pública las evalúan.
-- Para anon devuelven null (auth.uid() es null), así que no exponen nada.
revoke execute on function public.current_user_role() from public;
revoke execute on function public.current_user_school_id() from public;
grant execute on function public.current_user_role() to anon, authenticated;
grant execute on function public.current_user_school_id() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.schools       enable row level security;
alter table public.profiles      enable row level security;
alter table public.needs         enable row level security;
alter table public.commitments   enable row level security;
alter table public.hedera_events enable row level security;

-- Escuelas: públicas.
create policy "schools: lectura pública"
  on public.schools for select
  to anon, authenticated
  using (true);

-- Perfiles: el propio, los que eligieron ser públicos, y todos para admin.
-- (profiles no contiene email ni datos sensibles.)
create policy "profiles: lectura propia o pública"
  on public.profiles for select
  to anon, authenticated
  using (
    show_publicly
    or id = (select auth.uid())
    or (select public.current_user_role()) = 'admin'
  );

-- Necesidades: públicas cuando están publicadas o completadas.
-- La escuela ve también las suyas pendientes; el admin ve todas.
create policy "needs: lectura según estado y rol"
  on public.needs for select
  to anon, authenticated
  using (
    status in ('published', 'completed')
    or (select public.current_user_role()) = 'admin'
    or (
      (select public.current_user_role()) = 'school_rep'
      and school_id = (select public.current_user_school_id())
    )
  );

-- Compromisos y eventos: visibles si la necesidad asociada es visible
-- (la subconsulta aplica la RLS de needs).
create policy "commitments: lectura si la necesidad es visible"
  on public.commitments for select
  to anon, authenticated
  using (need_id in (select id from public.needs));

create policy "hedera_events: lectura si la necesidad es visible"
  on public.hedera_events for select
  to anon, authenticated
  using (need_id in (select id from public.needs));

-- -----------------------------------------------------------------------------
-- Vistas (security_invoker: respetan la RLS de quien consulta)
-- -----------------------------------------------------------------------------
create view public.need_progress
with (security_invoker = true)
as
select
  n.id as need_id,
  n.goal_quantity,
  coalesce(sum(c.quantity) filter (where c.status <> 'cancelled'), 0)::numeric(12, 2) as committed_quantity,
  coalesce(sum(c.quantity) filter (where c.status = 'confirmed'), 0)::numeric(12, 2)  as confirmed_quantity,
  count(c.id) filter (where c.status <> 'cancelled')::integer                          as active_commitments
from public.needs n
left join public.commitments c on c.need_id = n.id
group by n.id, n.goal_quantity;

-- Registro de impacto: cada evento de trazabilidad con su contexto público.
create view public.impact_feed
with (security_invoker = true)
as
select
  e.id                  as event_id,
  e.event_type,
  e.created_at,
  e.submission_status,
  e.consensus_timestamp,
  e.need_id,
  n.title               as need_title,
  n.kind                as need_kind,
  e.school_id,
  s.name                as school_name,
  s.slug                as school_slug,
  s.municipality        as school_municipality,
  s.is_demo             as school_is_demo,
  e.commitment_id
from public.hedera_events e
join public.needs n   on n.id = e.need_id
join public.schools s on s.id = e.school_id;

grant select on public.need_progress to anon, authenticated;
grant select on public.impact_feed   to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Storage: evidencias de entrega (lectura pública, subida solo desde servidor)
-- Solo imágenes de objetos/obras. Se re-codifican en el cliente para eliminar
-- EXIF/GPS antes de subir. Nunca fotografías identificables de menores.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
