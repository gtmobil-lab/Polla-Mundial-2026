-- Migración: soporte alargue y penales en resultados y predicciones
-- Ejecutar en Supabase Dashboard → SQL Editor

ALTER TABLE results
  ADD COLUMN IF NOT EXISTS home_et  INT,
  ADD COLUMN IF NOT EXISTS away_et  INT,
  ADD COLUMN IF NOT EXISTS home_pk  INT,
  ADD COLUMN IF NOT EXISTS away_pk  INT;

ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS pk_winner TEXT; -- 'H' = local, 'A' = visitante, NULL = no predijo
