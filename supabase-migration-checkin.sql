-- ============================================================
-- MIGRACIÓN: Sistema de check-in Casa Estadio
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================================

-- Códigos de check-in por partido (uno activo a la vez)
create table if not exists checkin_codes (
  match_n    integer primary key,
  code       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Registro de jugadores que hicieron check-in
create table if not exists checkins (
  id         bigserial primary key,
  player_id  text not null references players(id) on delete cascade,
  match_n    integer not null,
  created_at timestamptz not null default now(),
  unique (player_id, match_n)
);

-- Activar RLS
alter table checkin_codes enable row level security;
alter table checkins enable row level security;

-- Políticas: lectura y escritura pública (app recreativa entre amigos)
create policy "read checkin_codes"  on checkin_codes for select using (true);
create policy "write checkin_codes" on checkin_codes for all    using (true);
create policy "read checkins"       on checkins      for select using (true);
create policy "insert checkins"     on checkins      for insert with check (true);
