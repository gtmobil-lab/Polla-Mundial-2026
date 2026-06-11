-- Migración: tablas para notificaciones push web
-- Ejecutar en Supabase Dashboard → SQL Editor

-- Suscripciones push por dispositivo/navegador
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint   text UNIQUE NOT NULL,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  following  text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Sin RLS: datos no sensibles; el frontend (anon key) necesita escribir
ALTER TABLE push_subscriptions DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO anon, authenticated;

-- Log de notificaciones enviadas: evita duplicados
CREATE TABLE IF NOT EXISTS notifications_log (
  id       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  match_n  int  NOT NULL,
  type     text NOT NULL,   -- 'pre' (1h antes) | 'post' (resultado final)
  sent_at  timestamptz DEFAULT now(),
  UNIQUE(match_n, type)
);

ALTER TABLE notifications_log DISABLE ROW LEVEL SECURITY;
