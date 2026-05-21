-- =====================================================================
-- Pollita Mundial 2026 - Supabase Setup
-- Ejecutar completo en: Supabase Dashboard > SQL Editor > New query
-- =====================================================================

-- 1. TABLAS

CREATE TABLE IF NOT EXISTS players (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS predictions (
  player_id   TEXT        NOT NULL,
  match_n     INTEGER     NOT NULL CHECK (match_n BETWEEN 1 AND 104),
  home_score  INTEGER     NOT NULL CHECK (home_score BETWEEN 0 AND 20),
  away_score  INTEGER     NOT NULL CHECK (away_score BETWEEN 0 AND 20),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (player_id, match_n),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS results (
  match_n     INTEGER PRIMARY KEY CHECK (match_n BETWEEN 1 AND 104),
  home_score  INTEGER NOT NULL CHECK (home_score BETWEEN 0 AND 20),
  away_score  INTEGER NOT NULL CHECK (away_score BETWEEN 0 AND 20),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ROW LEVEL SECURITY

ALTER TABLE players     ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE results     ENABLE ROW LEVEL SECURITY;

-- Players: lectura y escritura pública (app privada entre amigos)
CREATE POLICY "players_select" ON players FOR SELECT USING (true);
CREATE POLICY "players_insert" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "players_delete" ON players FOR DELETE USING (true);

-- Predictions: lectura y escritura pública
CREATE POLICY "predictions_select" ON predictions FOR SELECT USING (true);
CREATE POLICY "predictions_insert" ON predictions FOR INSERT WITH CHECK (true);
CREATE POLICY "predictions_update" ON predictions FOR UPDATE USING (true);

-- Results: lectura pública, escritura controlada por adminMode en la app
CREATE POLICY "results_select" ON results FOR SELECT USING (true);
CREATE POLICY "results_insert" ON results FOR INSERT WITH CHECK (true);
CREATE POLICY "results_update" ON results FOR UPDATE USING (true);
CREATE POLICY "results_delete" ON results FOR DELETE USING (true);

-- 3. REALTIME (sincronización en vivo entre dispositivos)

ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE predictions;
ALTER PUBLICATION supabase_realtime ADD TABLE results;
