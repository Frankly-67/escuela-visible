-- =============================================================================
-- Datos DEMO — escuelas FICTICIAS.
-- Los municipios son reales; las escuelas NO existen. Todas llevan is_demo = true
-- y "(DEMO)" en el nombre. Las coordenadas son aproximadas, en zona rural.
--
-- Las cuentas demo y las necesidades se crean con un script (fase 2) para que
-- recorran el flujo real y generen sus eventos en Hedera.
-- =============================================================================

insert into public.schools
  (id, slug, name, municipality, vereda, latitude, longitude, description, students_range, is_demo)
values
  (
    '00000000-0000-4000-a000-00000000000a',
    'escuela-demo-el-mirador',
    'Escuela Rural El Mirador (DEMO)',
    'Barichara',
    'Vereda El Mirador (ficticia)',
    6.652000, -73.241000,
    'Escuela ficticia creada para demostrar la plataforma. Sede rural unitaria con un aula multigrado y un pequeño comedor escolar.',
    '20–40',
    true
  ),
  (
    '00000000-0000-4000-a000-00000000000b',
    'escuela-demo-la-cascada',
    'Escuela Rural La Cascada (DEMO)',
    'San Gil',
    'Vereda La Cascada (ficticia)',
    6.521000, -73.108000,
    'Escuela ficticia creada para demostrar la plataforma. Dos aulas, huerta escolar y conectividad intermitente.',
    '40–60',
    true
  ),
  (
    '00000000-0000-4000-a000-00000000000c',
    'escuela-demo-los-robles',
    'Escuela Rural Los Robles (DEMO)',
    'Charalá',
    'Vereda Los Robles (ficticia)',
    6.305000, -73.162000,
    'Escuela ficticia creada para demostrar la plataforma. Sede de difícil acceso con necesidades de agua y saneamiento.',
    '10–20',
    true
  )
on conflict (id) do nothing;
