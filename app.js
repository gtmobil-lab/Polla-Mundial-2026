// ============================================================
// MUNDIAL 2026 PWA - App Logic
// ============================================================

const APP = {
  users: [],
  currentUserId: null,
  predictions: {},   // { userId: { matchN: {h, a} } }
  results: {},       // { matchN: {h, a} }
  brackets: {},      // { matchN: { home: teamCode, away: teamCode } } — overrides admin
  following: [],     // array de códigos de equipo
  adminMode: false,  // permite editar resultados
  currentView: "home",
  navigationStack: []
};

const STORAGE_KEY    = "mundial2026_v1";
const MY_PLAYERS_KEY = "mw26_mine_v1"; // IDs creados en este dispositivo (no se sincroniza)

function getMyPlayers() {
  try { return JSON.parse(localStorage.getItem(MY_PLAYERS_KEY) || "[]"); } catch(e) { return []; }
}
function saveMyPlayers(arr) {
  try { localStorage.setItem(MY_PLAYERS_KEY, JSON.stringify(arr)); } catch(e) {}
}

// ====== SUPABASE CONFIG ======
// 1. Crea un proyecto en https://supabase.com (plan gratuito)
// 2. Ejecuta supabase-setup.sql en Dashboard > SQL Editor
// 3. Copia Project URL y anon key desde Dashboard > Settings > API
const SUPABASE_URL = "https://ebasnvygazfqzkpebybw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_6lHWN72pn_0pZ6MB36KEzg_Q0gV6z_w";

let sb = null;
let _realtimeChannel = null;
let _dbLoading = false;

function initSupabase() {
  if (!SUPABASE_URL || SUPABASE_URL === "TU_URL_SUPABASE") return false;
  try {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const badge = document.getElementById("sync-badge");
    if (badge) badge.style.display = "inline-flex";
    return true;
  } catch(e) {
    console.warn("Supabase no disponible:", e);
    return false;
  }
}

// ====== DB — CARGA CENTRAL ======
async function dbLoad() {
  if (_dbLoading) return;
  _dbLoading = true;

  if (!sb) {
    load();
    _dbLoading = false;
    return;
  }

  showLoading(true);
  setSyncBadge("syncing");

  try {
    const [
      { data: players, error: e1 },
      { data: preds,   error: e2 },
      { data: res,     error: e3 },
      { data: bracks,  error: e4 }
    ] = await Promise.all([
      sb.from("players").select("id, name").order("created_at"),
      sb.from("predictions").select("player_id, match_n, home_score, away_score"),
      sb.from("results").select("match_n, home_score, away_score"),
      sb.from("brackets").select("match_n, home_code, away_code")
    ]);
    if (e1 || e2 || e3 || e4) throw new Error(e1?.message || e2?.message || e3?.message || e4?.message);

    APP.users = players || [];

    APP.predictions = {};
    for (const p of (preds || [])) {
      if (!APP.predictions[p.player_id]) APP.predictions[p.player_id] = {};
      APP.predictions[p.player_id][p.match_n] = { h: p.home_score, a: p.away_score };
    }

    APP.results = {};
    for (const r of (res || [])) APP.results[r.match_n] = { h: r.home_score, a: r.away_score };

    APP.brackets = {};
    for (const b of (bracks || [])) {
      APP.brackets[b.match_n] = { home: b.home_code, away: b.away_code };
    }

    // Preferencias locales (no se sincronizan entre dispositivos)
    const local = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    APP.following = local.following || [];
    // Revocar adminMode si el TTL expiró
    APP.adminMode = (local.adminMode && local.adminModeExpiry && local.adminModeExpiry > Date.now()) ? true : false;
    const myPlayers = getMyPlayers();
    const validForDevice = id => APP.users.some(u => u.id === id) &&
      (local.adminMode || myPlayers.includes(id));
    APP.currentUserId = (local.currentUserId && validForDevice(local.currentUserId))
      ? local.currentUserId
      : (myPlayers.find(id => APP.users.some(u => u.id === id)) || (local.adminMode ? APP.users[0]?.id : null) || null);

    save();
    setSyncBadge("online");

  } catch(e) {
    console.warn("Supabase no disponible, usando caché local:", e);
    load();
    setSyncBadge("offline");
  }

  _dbLoading = false;
  showLoading(false);
}

// ====== DB — OPERACIONES ======
async function dbAddPlayer(id, name) {
  if (!sb) return;
  const { error } = await sb.from("players").insert({ id, name });
  if (error) throw error;
}

async function dbDeletePlayer(id) {
  if (!sb) return;
  const { error } = await sb.from("players").delete().eq("id", id);
  if (error) throw error;
}

async function dbUpsertPrediction(playerId, matchN, h, a) {
  if (!sb) return;
  const { error } = await sb.from("predictions").upsert(
    { player_id: playerId, match_n: matchN, home_score: h, away_score: a, updated_at: new Date().toISOString() },
    { onConflict: "player_id,match_n" }
  );
  if (error) throw error;
}

async function dbUpsertResult(matchN, h, a) {
  if (!sb) return;
  const { error } = await sb.from("results").upsert(
    { match_n: matchN, home_score: h, away_score: a },
    { onConflict: "match_n" }
  );
  if (error) throw error;
}

async function dbDeleteResult(matchN) {
  if (!sb) return;
  const { error } = await sb.from("results").delete().eq("match_n", matchN);
  if (error) throw error;
}

async function dbUpsertBracket(matchN, homeCode, awayCode) {
  if (!sb) return;
  const { error } = await sb.from("brackets").upsert(
    { match_n: matchN, home_code: homeCode || null, away_code: awayCode || null },
    { onConflict: "match_n" }
  );
  if (error) throw error;
}

async function dbDeleteBracket(matchN) {
  if (!sb) return;
  const { error } = await sb.from("brackets").delete().eq("match_n", matchN);
  if (error) throw error;
}

// ====== REALTIME ======
function subscribeRealtime() {
  if (!sb) return;
  if (_realtimeChannel) sb.removeChannel(_realtimeChannel);
  _realtimeChannel = sb.channel("app-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "players" },     () => dbLoad())
    .on("postgres_changes", { event: "*", schema: "public", table: "predictions" }, () => dbLoad())
    .on("postgres_changes", { event: "*", schema: "public", table: "results" },     () => dbLoad())
    .on("postgres_changes", { event: "*", schema: "public", table: "brackets" },    () => dbLoad())
    .subscribe(status => {
      if (status === "SUBSCRIBED") setSyncBadge("online");
    });
}

// ====== LOADING / SYNC BADGE ======
function showLoading(show) {
  const el = document.getElementById("loading-overlay");
  if (el) el.style.display = show ? "flex" : "none";
}

function setSyncBadge(state) {
  const el = document.getElementById("sync-badge");
  if (!el) return;
  const labels = { online: "● En vivo", offline: "○ Sin conexión", syncing: "↻ Sync..." };
  el.className = "sync-badge " + state;
  el.textContent = labels[state] || "";
}

// ====== PERSISTENCIA ======
const ADMIN_TTL_MS = 4 * 60 * 60 * 1000; // 4 horas

function save() {
  const data = {
    users: APP.users,
    currentUserId: APP.currentUserId,
    predictions: APP.predictions,
    results: APP.results,
    brackets: APP.brackets,
    following: APP.following,
    adminMode: APP.adminMode,
    adminModeExpiry: APP.adminMode ? (Date.now() + ADMIN_TTL_MS) : null
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("No se pudo guardar", e);
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    APP.users = data.users || [];
    APP.currentUserId = data.currentUserId || null;
    APP.predictions = data.predictions || {};
    APP.results = data.results || {};
    APP.brackets = data.brackets || {};
    APP.following = data.following || [];
    // Revocar adminMode si el TTL expiró
    APP.adminMode = (data.adminMode && data.adminModeExpiry && data.adminModeExpiry > Date.now()) ? true : false;
  } catch (e) {
    console.warn("No se pudo cargar", e);
  }
}

// ====== UTIL ======
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const days = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
  const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${days[date.getDay()]} ${d} ${months[m-1]}`;
}

function fmtDateLong(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${d} de ${months[m-1]} ${y}`;
}

function matchDateTime(match) {
  // Devuelve Date object combinando fecha + hora
  const [y, m, d] = match.date.split("-").map(Number);
  const [hh, mm] = match.hour.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

function matchHasStarted(match) {
  return matchDateTime(match) <= new Date();
}

function getMatch(n) {
  return MATCHES.find(m => m.n === n);
}

// ====== TOAST ======
let toastTimer = null;
function toast(msg, type = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show" + (type ? " " + type : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ====== SCORING ======
// Sistema de puntos:
//  - Resultado exacto: 5 pts
//  - Resultado correcto (ganador/empate, sin marcador exacto): 2 pts
//  - Sin acierto: 0 pts
function scorePrediction(pred, result) {
  if (!pred || !result) return null;
  if (pred.h === result.h && pred.a === result.a) return { pts: 5, type: "exact" };
  const predOutcome = pred.h > pred.a ? "H" : pred.h < pred.a ? "A" : "D";
  const realOutcome = result.h > result.a ? "H" : result.h < result.a ? "A" : "D";
  if (predOutcome === realOutcome) return { pts: 2, type: "outcome" };
  return { pts: 0, type: "miss" };
}

function userRanking() {
  return APP.users.map(u => {
    let pts = 0, exact = 0, outcome = 0, miss = 0, total = 0;
    const userPreds = APP.predictions[u.id] || {};
    Object.entries(userPreds).forEach(([n, pred]) => {
      const result = APP.results[n];
      if (!result) return;
      total++;
      const s = scorePrediction(pred, result);
      if (!s) return;
      pts += s.pts;
      if (s.type === "exact") exact++;
      else if (s.type === "outcome") outcome++;
      else miss++;
    });
    return { ...u, pts, exact, outcome, miss, total };
  }).sort((a, b) => b.pts - a.pts || b.exact - a.exact);
}

// ====== STANDINGS POR GRUPO ======
function groupStandings(groupId) {
  const teams = Object.values(TEAMS).filter(t => t.group === groupId);
  const table = teams.map(t => ({
    code: t.code, name: t.name, flag: t.flag,
    pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dif: 0, pts: 0
  }));

  MATCHES.filter(m => m.group === groupId).forEach(m => {
    const r = APP.results[m.n];
    if (!r || !m.home || !m.away) return;
    const homeRow = table.find(t => t.code === m.home);
    const awayRow = table.find(t => t.code === m.away);
    if (!homeRow || !awayRow) return;

    homeRow.pj++; awayRow.pj++;
    homeRow.gf += r.h; homeRow.gc += r.a;
    awayRow.gf += r.a; awayRow.gc += r.h;

    if (r.h > r.a) { homeRow.g++; homeRow.pts += 3; awayRow.p++; }
    else if (r.h < r.a) { awayRow.g++; awayRow.pts += 3; homeRow.p++; }
    else { homeRow.e++; awayRow.e++; homeRow.pts++; awayRow.pts++; }
  });

  table.forEach(t => t.dif = t.gf - t.gc);
  table.sort((a, b) => b.pts - a.pts || b.dif - a.dif || b.gf - a.gf);
  return table;
}

// ====== ESTADÍSTICAS DE EQUIPO ======
function teamStats(teamCode) {
  let pj = 0, g = 0, e = 0, p = 0, gf = 0, gc = 0;
  MATCHES.forEach(m => {
    if (m.home !== teamCode && m.away !== teamCode) return;
    const r = APP.results[m.n];
    if (!r) return;
    pj++;
    if (m.home === teamCode) {
      gf += r.h; gc += r.a;
      if (r.h > r.a) g++; else if (r.h < r.a) p++; else e++;
    } else {
      gf += r.a; gc += r.h;
      if (r.a > r.h) g++; else if (r.a < r.h) p++; else e++;
    }
  });
  return { pj, g, e, p, gf, gc, dif: gf - gc, pts: g * 3 + e };
}

function teamRoute(teamCode) {
  // Devuelve array de partidos del equipo, con info de W/D/L/U(upcoming)
  return MATCHES.filter(m => m.home === teamCode || m.away === teamCode)
    .sort((a, b) => a.n - b.n)
    .map(m => {
      const r = APP.results[m.n];
      const isHome = m.home === teamCode;
      const rival = isHome ? m.away : m.home;
      let result = "U", scoreText = "vs";

      if (r) {
        const myG = isHome ? r.h : r.a;
        const otherG = isHome ? r.a : r.h;
        scoreText = `${myG}-${otherG}`;
        if (myG > otherG) result = "W";
        else if (myG < otherG) result = "L";
        else result = "D";
      }
      return { match: m, rival, result, scoreText, isHome };
    });
}

// ====== BRACKET KO — RESOLUCIÓN DE CRUCES ======

const KO_STAGES_SET = new Set(['R32','R16','QF','SF','3P','FINAL']);

// Slots auto-calculables de los Dieciseisavos (1°/2° de grupo)
// Los slots ausentes son los 3° mejores → el admin los completa
const R32_AUTO_MAP = {
  73: { home: { pos: 2, group: 'A' }, away: { pos: 2, group: 'B' } },
  74: { home: { pos: 1, group: 'E' } },
  75: { home: { pos: 1, group: 'F' }, away: { pos: 2, group: 'C' } },
  76: { home: { pos: 1, group: 'C' }, away: { pos: 2, group: 'F' } },
  77: { home: { pos: 1, group: 'I' } },
  78: { home: { pos: 2, group: 'E' }, away: { pos: 2, group: 'I' } },
  79: { home: { pos: 1, group: 'A' } },
  80: { home: { pos: 1, group: 'L' } },
  81: { home: { pos: 1, group: 'D' } },
  82: { home: { pos: 1, group: 'G' } },
  83: { home: { pos: 2, group: 'K' }, away: { pos: 2, group: 'L' } },
  84: { home: { pos: 1, group: 'H' }, away: { pos: 2, group: 'J' } },
  85: { home: { pos: 1, group: 'B' } },
  86: { home: { pos: 1, group: 'J' }, away: { pos: 2, group: 'H' } },
  87: { home: { pos: 1, group: 'K' } },
  88: { home: { pos: 2, group: 'D' }, away: { pos: 2, group: 'G' } },
};

// Propagación de ganadores/perdedores para Octavos en adelante
const KO_WINNER_MAP = {
  89:  { home: { win: 74 }, away: { win: 77 } },
  90:  { home: { win: 73 }, away: { win: 75 } },
  91:  { home: { win: 76 }, away: { win: 78 } },
  92:  { home: { win: 79 }, away: { win: 80 } },
  93:  { home: { win: 83 }, away: { win: 84 } },
  94:  { home: { win: 81 }, away: { win: 82 } },
  95:  { home: { win: 86 }, away: { win: 88 } },
  96:  { home: { win: 85 }, away: { win: 87 } },
  97:  { home: { win: 89 }, away: { win: 90 } },
  98:  { home: { win: 93 }, away: { win: 94 } },
  99:  { home: { win: 91 }, away: { win: 92 } },
  100: { home: { win: 95 }, away: { win: 96 } },
  101: { home: { win: 97 }, away: { win: 98 } },
  102: { home: { win: 99 }, away: { win: 100 } },
  103: { home: { lose: 101 }, away: { lose: 102 } },
  104: { home: { win: 101 }, away: { win: 102 } },
};

function resolveKOSlot(slot) {
  if (!slot) return null;
  if (slot.group) {
    const standings = groupStandings(slot.group);
    return standings[slot.pos - 1]?.code || null;
  }
  if (slot.win !== undefined) {
    const teams = resolveMatchTeams(slot.win);
    const result = APP.results[slot.win];
    if (!teams.home || !teams.away || !result) return null;
    if (result.h > result.a) return teams.home;
    if (result.a > result.h) return teams.away;
    return null; // empate → no se puede determinar auto (penales)
  }
  if (slot.lose !== undefined) {
    const teams = resolveMatchTeams(slot.lose);
    const result = APP.results[slot.lose];
    if (!teams.home || !teams.away || !result) return null;
    if (result.h > result.a) return teams.away;
    if (result.a > result.h) return teams.home;
    return null;
  }
  return null;
}

function resolveMatchTeams(n) {
  const match = getMatch(n);
  if (!match) return { home: null, away: null };

  // Fase de grupos: datos estáticos
  if (!KO_STAGES_SET.has(match.group)) return { home: match.home, away: match.away };

  // Fase KO: cálculo automático
  let home = null, away = null;

  if (R32_AUTO_MAP[n]) {
    const m = R32_AUTO_MAP[n];
    if (m.home) home = resolveKOSlot(m.home);
    if (m.away) away = resolveKOSlot(m.away);
  }
  if (KO_WINNER_MAP[n]) {
    const m = KO_WINNER_MAP[n];
    home = resolveKOSlot(m.home);
    away = resolveKOSlot(m.away);
  }

  // Override del admin tiene prioridad sobre el auto
  const ov = APP.brackets[n];
  if (ov?.home) home = ov.home;
  if (ov?.away) away = ov.away;

  return { home, away };
}

function teamSelectOptions(selectedCode) {
  return Object.values(TEAMS)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(t => `<option value="${t.code}"${t.code === selectedCode ? ' selected' : ''}>${t.flag} ${t.name}</option>`)
    .join('');
}

// ====== NAVEGACIÓN ======
function navTo(view, params = {}, pushStack = true) {
  if (pushStack && APP.currentView !== view) {
    APP.navigationStack.push({ view: APP.currentView, params: APP.currentParams || {} });
  }
  APP.currentView = view;
  APP.currentParams = params;

  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const el = document.getElementById("view-" + view);
  if (el) el.classList.add("active");

  // Bottom nav
  document.querySelectorAll(".nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.target === view);
  });

  const mainEl = document.querySelector("main");
  if (mainEl) mainEl.scrollTop = 0;
  renderView(view, params);
}

function goBack() {
  if (APP.navigationStack.length > 0) {
    const prev = APP.navigationStack.pop();
    navTo(prev.view, prev.params, false);
  } else {
    navTo("home", {}, false);
  }
}

// ====== RENDER VIEWS ======
function renderView(view, params) {
  switch (view) {
    case "home":      renderHome(); break;
    case "calendar":  renderCalendar(); break;
    case "teams":     renderTeams(); break;
    case "ranking":   renderRanking(); break;
    case "settings":  renderSettings(); break;
    case "group":     renderGroup(params.groupId); break;
    case "ko":        renderKO(params.stageId); break;
    case "team":      renderTeamDetail(params.teamCode); break;
  }
  updateUserPill();
}

// ====== HOME / INICIO ======
function renderHome() {
  const el = document.getElementById("view-home");
  const totalMatches = MATCHES.length;
  const playedMatches = Object.keys(APP.results).length;
  const followingCount = APP.following.length;

  el.innerHTML = `
    <div class="hero">
      <div class="hero-title">MUNDIAL<br>FIFA 2026</div>
      <div class="hero-sub">USA · Canadá · México · 11 jun → 19 jul</div>
      <div class="hero-meta">
        <div class="hero-stat">
          <div class="hero-stat-n">${totalMatches}</div>
          <div class="hero-stat-l">Partidos</div>
        </div>
        <div class="hero-stat">
          <div class="hero-stat-n">${playedMatches}</div>
          <div class="hero-stat-l">Jugados</div>
        </div>
        <div class="hero-stat">
          <div class="hero-stat-n">${followingCount}</div>
          <div class="hero-stat-l">Sigues</div>
        </div>
      </div>
    </div>

    <div class="section-bar">FASE DE GRUPOS</div>
    <div class="groups-grid">
      ${GROUPS.map(g => {
        const teams = Object.values(TEAMS).filter(t => t.group === g);
        return `
          <button class="group-tile" data-group="${g}" onclick="navTo('group', {groupId: '${g}'})">
            <div>
              <div class="group-tile-label">GRUPO ${g}</div>
              <div class="group-tile-flags">${teams.map(t => t.flag).join(" ")}</div>
            </div>
            <div class="group-tile-teams">${teams.map(t => t.name.toUpperCase()).join(" · ")}</div>
          </button>
        `;
      }).join("")}
    </div>

    <div class="section-bar">FASE ELIMINATORIA</div>
    <div class="ko-grid">
      ${KO_STAGES.map(s => `
        <button class="ko-tile ${s.id === 'FINAL' ? 'final' : ''}" onclick="navTo('ko', {stageId: '${s.id}'})">
          <div class="ko-tile-icon">${s.id === 'FINAL' ? '🏆' : s.id === '3P' ? '🥉' : s.id === 'SF' ? '⚔️' : s.id === 'QF' ? '🎯' : s.id === 'R16' ? '🔥' : '🎲'}</div>
          <div class="ko-tile-label">${s.name}</div>
          <div class="ko-tile-n">${s.range[0] === s.range[1] ? '#' + s.range[0] : '#' + s.range[0] + '-' + s.range[1]}</div>
        </button>
      `).join("")}
    </div>

    ${renderFixture()}
  `;
}

// ====== FIXTURE / SEGUIMIENTO ======
function renderFixture() {
  const koStages = [
    { lbl: 'DIECISEISAVOS', matches: [73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88] },
    { lbl: 'OCTAVOS',       matches: [89,90,91,92,93,94,95,96] },
    { lbl: 'CUARTOS',       matches: [97,98,99,100] },
    { lbl: 'SEMIS',         matches: [101,102] },
    { lbl: '🏆 FINAL',      matches: [104], extra: { lbl: '🥉 3er PUESTO', n: 103 } },
  ];

  return `
    <div class="section-bar" style="margin-top:4px;">FIXTURE · SEGUIMIENTO</div>

    <div style="padding:10px 14px 2px;">
      <div class="fixture-sublbl">FASE DE GRUPOS</div>
      <div class="fixture-groups">
        ${GROUPS.map(g => renderGroupMini(g)).join('')}
      </div>
    </div>

    <div style="padding:10px 14px 4px;">
      <div class="fixture-sublbl">FASE ELIMINATORIA · desliza →</div>
    </div>
    <div class="fixture-bracket-wrap">
      <div class="fixture-bracket">
        ${koStages.map(s => `
          <div class="fixture-stage-col">
            <div class="fixture-stage-lbl">${s.lbl}</div>
            ${s.matches.map(n => renderBktMatch(n)).join('')}
            ${s.extra ? `<div class="fixture-stage-lbl" style="margin-top:8px;">${s.extra.lbl}</div>${renderBktMatch(s.extra.n)}` : ''}
          </div>
        `).join('<div class="fixture-bracket-sep"></div>')}
      </div>
    </div>
  `;
}

function renderGroupMini(groupId) {
  const standings = groupStandings(groupId);
  return `
    <div class="group-mini" onclick="navTo('group',{groupId:'${groupId}'})">
      <div class="group-mini-hdr">GRP ${groupId}</div>
      ${standings.map((t, i) => `
        <div class="group-mini-row${i < 2 ? ' q' : ''}">
          <span class="gm-pos">${i + 1}</span>
          <span class="gm-flag">${t.flag}</span>
          <span class="gm-name">${t.name.length > 10 ? t.name.slice(0,10) + '…' : t.name}</span>
          <span class="gm-pts">${t.pts}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderBktMatch(n) {
  const resolved = resolveMatchTeams(n);
  const result   = APP.results[n];
  const home     = resolved.home ? TEAMS[resolved.home] : null;
  const away     = resolved.away ? TEAMS[resolved.away] : null;
  const homeWon  = result && result.h > result.a;
  const awayWon  = result && result.a > result.h;

  const teamRow = (team, won, score) => `
    <div class="bkt-t${won ? ' w' : ''}">
      ${team
        ? `<span class="bkt-flag">${team.flag}</span><span class="bkt-name">${team.name.length > 11 ? team.name.slice(0,11) + '…' : team.name}</span>`
        : `<span class="bkt-tbd">—</span>`}
      ${score !== undefined ? `<span class="bkt-sc">${score}</span>` : ''}
    </div>`;

  return `
    <div class="bkt-match${result ? ' done' : ''}">
      ${teamRow(home, homeWon, result?.h)}
      ${teamRow(away, awayWon, result?.a)}
    </div>`;
}

// ====== GRUPO ======
function renderGroup(groupId) {
  const el = document.getElementById("view-group");
  const teams = Object.values(TEAMS).filter(t => t.group === groupId);
  const matches = MATCHES.filter(m => m.group === groupId);
  const standings = groupStandings(groupId);

  // Agrupar partidos por fecha (matchday)
  const byMatchday = {};
  matches.forEach(m => {
    if (!byMatchday[m.date]) byMatchday[m.date] = [];
    byMatchday[m.date].push(m);
  });

  el.innerHTML = `
    <div class="group-header" data-group="${groupId}">
      <button class="back-btn" onclick="goBack()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Volver
      </button>
      <div class="group-title">GRUPO ${groupId}<small>${teams.map(t => t.name).join(" · ")}</small></div>
    </div>

    <div class="standings-table">
      <div class="standings-row head">
        <div class="pos">#</div>
        <div>EQUIPO</div>
        <div class="stat">PJ</div>
        <div class="stat">G</div>
        <div class="stat">E</div>
        <div class="stat">DIF</div>
        <div class="pts">PTS</div>
      </div>
      ${standings.map((t, i) => `
        <div class="standings-row ${i < 2 ? 'qual' : ''}">
          <div class="pos">${i + 1}</div>
          <div class="team-name"><span class="flag">${t.flag}</span> ${t.name}</div>
          <div class="stat">${t.pj}</div>
          <div class="stat">${t.g}</div>
          <div class="stat">${t.e}</div>
          <div class="stat">${t.dif > 0 ? '+' + t.dif : t.dif}</div>
          <div class="pts">${t.pts}</div>
        </div>
      `).join("")}
    </div>

    ${Object.entries(byMatchday).map(([date, dayMatches]) => `
      <div class="matchday-section">
        <div class="matchday-title">${fmtDateLong(date)}</div>
        ${dayMatches.map(m => matchCardHTML(m)).join("")}
      </div>
    `).join("")}
  `;

  attachMatchCardHandlers();
}

// ====== KNOCKOUT / FASE ELIMINATORIA ======
function renderKO(stageId) {
  const el = document.getElementById("view-ko");
  const stage = KO_STAGES.find(s => s.id === stageId);
  const matches = MATCHES.filter(m => m.group === stageId);

  const byDate = {};
  matches.forEach(m => {
    if (!byDate[m.date]) byDate[m.date] = [];
    byDate[m.date].push(m);
  });

  el.innerHTML = `
    <div class="group-header" data-group="KO">
      <button class="back-btn" onclick="goBack()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Volver
      </button>
      <div class="group-title">${stage.name.toUpperCase()}<small>${matches.length} partido${matches.length > 1 ? 's' : ''}</small></div>
    </div>

    <div style="background: rgba(244,180,0,0.1); margin: 12px 14px; padding: 10px 14px; border-radius: 10px; font-size: 11px; color: var(--text-soft); border-left: 3px solid var(--gold); line-height: 1.5;">
      <strong style="font-family: 'JetBrains Mono', monospace; text-transform: uppercase; font-size: 10px; letter-spacing: 0.06em;">⚠ Cruces tentativos</strong><br>
      Las parejas exactas se definen al cerrar la fase de grupos. Sedes, fechas y horarios ya confirmados.
    </div>

    ${Object.entries(byDate).map(([date, dayMatches]) => `
      <div class="matchday-section">
        <div class="matchday-title">${fmtDateLong(date)}</div>
        ${dayMatches.map(m => matchCardHTML(m)).join("")}
      </div>
    `).join("")}
  `;

  attachMatchCardHandlers();
}

// ====== MATCH CARD HTML ======
// opts.showPred  = true → muestra zona de predicciones (grupos y fases KO)
// opts.showAdmin = true → muestra zona de resultados + editor de cruces KO (calendario)
function matchCardHTML(m, opts = { showPred: true, showAdmin: false }) {
  const isKOStage = KO_STAGES_SET.has(m.group);
  const resolved = isKOStage ? resolveMatchTeams(m.n) : { home: m.home, away: m.away };
  const home = resolved.home ? TEAMS[resolved.home] : null;
  const away = resolved.away ? TEAMS[resolved.away] : null;
  const stadium = STADIUMS[m.stadium];
  const result = APP.results[m.n];
  const hasStarted = matchHasStarted(m);
  const isLocked = hasStarted || !!result;

  const userPred = APP.currentUserId && APP.predictions[APP.currentUserId]
    ? APP.predictions[APP.currentUserId][m.n] : null;

  const predScore = result && userPred ? scorePrediction(userPred, result) : null;

  // Marcar si sigue alguno de los equipos
  const followsHome = home && APP.following.includes(home.code);
  const followsAway = away && APP.following.includes(away.code);

  return `
    <div class="match-card ${result ? 'finished' : ''}" data-match-n="${m.n}">
      <div class="match-head">
        <span><span class="match-id">#${String(m.n).padStart(3, '0')}</span> · ${m.stage}</span>
        <span>${m.hour} CL</span>
      </div>
      <div class="match-body">
        ${home ? `
          <div class="team-block home" onclick="navTo('team', {teamCode: '${home.code}'})">
            <div>
              <div class="name">${home.name.toUpperCase()}${followsHome ? ' <span class="follow-star">★</span>' : ''}</div>
            </div>
            <div class="flag">${home.flag}</div>
          </div>
        ` : `<div class="team-block home placeholder">${(m.placeholder || '').split(' vs ')[0] || '—'}</div>`}

        <div class="score-block">
          ${result
            ? `<div class="score"><span>${result.h}</span><span class="sep">-</span><span>${result.a}</span></div>`
            : `<div class="vs">VS</div>`}
        </div>

        ${away ? `
          <div class="team-block away" onclick="navTo('team', {teamCode: '${away.code}'})">
            <div class="flag">${away.flag}</div>
            <div>
              <div class="name">${away.name.toUpperCase()}${followsAway ? ' <span class="follow-star">★</span>' : ''}</div>
            </div>
          </div>
        ` : `<div class="team-block away placeholder">${(m.placeholder || '').split(' vs ')[1] || '—'}</div>`}
      </div>

      <div class="match-meta">
        <span class="match-meta-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ${stadium.name}, ${stadium.city}
        </span>
      </div>

      <div class="tv-row">
        ${m.tv.map(code => {
          const b = BROADCASTERS[code];
          return `<span class="tv-badge ${b.color}">${b.code}</span>`;
        }).join("")}
      </div>

      ${opts.showPred && home && away ? `
        <div class="pred-zone ${isLocked && !APP.currentUserId ? 'disabled' : ''}">
          <div class="pred-label">${
            result && predScore
              ? (predScore.type === 'exact' ? '✓ EXACTO' : predScore.type === 'outcome' ? '✓ RESULTADO' : '✗ FALLASTE')
              : APP.currentUserId
                ? (isLocked && !userPred ? 'PREDICCIÓN CERRADA' : 'TU PREDICCIÓN')
                : 'Crea un usuario'
          }</div>
          <div class="score-inputs">
            <input type="number" min="0" max="20" class="score-input" data-pred="${m.n}" data-side="h"
              value="${userPred ? userPred.h : ''}" ${isLocked || !APP.currentUserId ? 'disabled' : ''}>
            <span style="color: var(--text-faint);">-</span>
            <input type="number" min="0" max="20" class="score-input" data-pred="${m.n}" data-side="a"
              value="${userPred ? userPred.a : ''}" ${isLocked || !APP.currentUserId ? 'disabled' : ''}>
          </div>
          ${result && predScore
            ? `<div class="pred-result-badge ${predScore.type}">+${predScore.pts} pt${predScore.pts !== 1 ? 's' : ''}</div>`
            : `<button class="btn-pred" data-save-pred="${m.n}" ${isLocked || !APP.currentUserId ? 'disabled' : ''}>${userPred ? 'Editar' : 'Guardar'}</button>`}
        </div>
      ` : ''}

      ${opts.showAdmin && APP.adminMode && home && away ? `
        <div class="admin-result">
          <label>ADMIN · Resultado:</label>
          <input type="number" min="0" max="20" class="score-input" data-result="${m.n}" data-side="h" value="${result ? result.h : ''}">
          <span style="color: var(--text-faint);">-</span>
          <input type="number" min="0" max="20" class="score-input" data-result="${m.n}" data-side="a" value="${result ? result.a : ''}">
          <button class="btn-pred" data-save-result="${m.n}">Guardar</button>
          ${result ? `<button class="btn-pred" style="background: var(--text-dim);" data-clear-result="${m.n}">Borrar</button>` : ''}
        </div>
      ` : ''}

      ${opts.showAdmin && APP.adminMode && isKOStage ? (() => {
        const hasOverride = !!APP.brackets[m.n];
        const autoHome = (() => { const ov = APP.brackets[m.n]; if (ov?.home) return null; if (R32_AUTO_MAP[m.n]?.home) return resolveKOSlot(R32_AUTO_MAP[m.n].home); if (KO_WINNER_MAP[m.n]?.home) return resolveKOSlot(KO_WINNER_MAP[m.n].home); return null; })();
        const autoAway = (() => { const ov = APP.brackets[m.n]; if (ov?.away) return null; if (R32_AUTO_MAP[m.n]?.away) return resolveKOSlot(R32_AUTO_MAP[m.n].away); if (KO_WINNER_MAP[m.n]?.away) return resolveKOSlot(KO_WINNER_MAP[m.n].away); return null; })();
        const selectStyle = "background:var(--bg-app);border:1px solid var(--line-2);border-radius:6px;padding:6px 8px;font-size:12px;color:var(--text);width:100%;";
        return `
          <div class="admin-result" style="flex-direction:column;align-items:stretch;gap:8px;">
            <label style="display:flex;justify-content:space-between;align-items:center;">
              ADMIN · Cruce KO
              ${hasOverride ? '<span style="font-size:10px;color:var(--gold);font-family:\'JetBrains Mono\',monospace;">EDITADO</span>' : '<span style="font-size:10px;color:var(--text-dim);font-family:\'JetBrains Mono\',monospace;">AUTO</span>'}
            </label>
            <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:6px;align-items:center;">
              <div>
                ${autoHome ? `<div style="font-size:10px;color:var(--text-dim);margin-bottom:2px;">Auto: ${TEAMS[autoHome]?.flag || ''} ${TEAMS[autoHome]?.name || autoHome}</div>` : ''}
                <select data-bracket="${m.n}" data-side="h" style="${selectStyle}">
                  <option value="">— Por definir —</option>
                  ${teamSelectOptions(resolved.home)}
                </select>
              </div>
              <span style="color:var(--text-faint);font-size:12px;">vs</span>
              <div>
                ${autoAway ? `<div style="font-size:10px;color:var(--text-dim);margin-bottom:2px;">Auto: ${TEAMS[autoAway]?.flag || ''} ${TEAMS[autoAway]?.name || autoAway}</div>` : ''}
                <select data-bracket="${m.n}" data-side="a" style="${selectStyle}">
                  <option value="">— Por definir —</option>
                  ${teamSelectOptions(resolved.away)}
                </select>
              </div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn-pred" style="flex:1;" data-save-bracket="${m.n}">Guardar cruce</button>
              ${hasOverride ? `<button class="btn-pred" style="background:var(--text-dim);" data-clear-bracket="${m.n}">Resetear auto</button>` : ''}
            </div>
          </div>`;
      })() : ''}
    </div>
  `;
}

function attachMatchCardHandlers() {
  document.querySelectorAll("[data-save-pred]").forEach(btn => {
    btn.addEventListener("click", () => savePrediction(parseInt(btn.dataset.savePred), btn));
  });

  document.querySelectorAll("[data-save-result]").forEach(btn => {
    btn.addEventListener("click", () => saveResult(parseInt(btn.dataset.saveResult), btn));
  });

  document.querySelectorAll("[data-clear-result]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const n = parseInt(btn.dataset.clearResult);
      delete APP.results[n];
      save();
      toast("Resultado borrado", "success");
      renderView(APP.currentView, APP.currentParams);
      try { await dbDeleteResult(n); } catch(e) { /* estado local ya actualizado */ }
    });
  });

  document.querySelectorAll("[data-save-bracket]").forEach(btn => {
    btn.addEventListener("click", () => saveBracket(parseInt(btn.dataset.saveBracket), btn));
  });

  document.querySelectorAll("[data-clear-bracket]").forEach(btn => {
    btn.addEventListener("click", () => clearBracket(parseInt(btn.dataset.clearBracket)));
  });
}

async function saveBracket(n, btn) {
  const zone = btn.closest(".admin-result");
  const hSel = zone?.querySelector(`select[data-bracket="${n}"][data-side="h"]`);
  const aSel = zone?.querySelector(`select[data-bracket="${n}"][data-side="a"]`);
  const homeVal = hSel?.value || null;
  const awayVal = aSel?.value || null;

  if (!homeVal && !awayVal) { toast("Selecciona al menos un equipo", "error"); return; }

  if (!APP.brackets[n]) APP.brackets[n] = {};
  if (homeVal) APP.brackets[n].home = homeVal;
  if (awayVal) APP.brackets[n].away = awayVal;
  save();
  toast("Cruce guardado", "success");
  renderView(APP.currentView, APP.currentParams);
  try { await dbUpsertBracket(n, homeVal, awayVal); } catch(e) { /* local ya actualizado */ }
}

async function clearBracket(n) {
  delete APP.brackets[n];
  save();
  toast("Cruce reseteado a automático", "success");
  renderView(APP.currentView, APP.currentParams);
  try { await dbDeleteBracket(n); } catch(e) { /* local ya actualizado */ }
}

async function savePrediction(n, btn) {
  if (!APP.currentUserId) { toast("Crea un usuario primero", "error"); return; }
  const m = getMatch(n);
  if (matchHasStarted(m)) { toast("El partido ya comenzó", "error"); return; }

  // Busca los inputs dentro del mismo .pred-zone del botón pulsado
  const zone = btn.closest(".pred-zone");
  const hInput = zone?.querySelector(`input[data-pred="${n}"][data-side="h"]`);
  const aInput = zone?.querySelector(`input[data-pred="${n}"][data-side="a"]`);
  const h = parseInt(hInput?.value);
  const a = parseInt(aInput?.value);

  if (isNaN(h) || isNaN(a) || h < 0 || a < 0) {
    toast("Ingresa marcador válido", "error"); return;
  }

  if (!APP.predictions[APP.currentUserId]) APP.predictions[APP.currentUserId] = {};
  APP.predictions[APP.currentUserId][n] = { h, a };
  save();
  toast(`Predicción ${h}-${a} guardada`, "success");
  renderView(APP.currentView, APP.currentParams);
  try { await dbUpsertPrediction(APP.currentUserId, n, h, a); } catch(e) { /* estado local ya actualizado */ }
}

async function saveResult(n, btn) {
  // Busca los inputs dentro del mismo .admin-result del botón pulsado
  const zone = btn.closest(".admin-result");
  const hInput = zone?.querySelector(`input[data-result="${n}"][data-side="h"]`);
  const aInput = zone?.querySelector(`input[data-result="${n}"][data-side="a"]`);
  const h = parseInt(hInput?.value);
  const a = parseInt(aInput?.value);

  if (isNaN(h) || isNaN(a) || h < 0 || a < 0) {
    toast("Ingresa marcador válido", "error"); return;
  }

  APP.results[n] = { h, a };
  save();
  toast(`Resultado #${n}: ${h}-${a} guardado`, "success");
  renderView(APP.currentView, APP.currentParams);
  try { await dbUpsertResult(n, h, a); } catch(e) { /* estado local ya actualizado */ }
}

// ====== CALENDARIO ======
function renderCalendar() {
  const el = document.getElementById("view-calendar");
  // Agrupar por fecha
  const byDate = {};
  MATCHES.forEach(m => {
    if (!byDate[m.date]) byDate[m.date] = [];
    byDate[m.date].push(m);
  });

  const dates = Object.keys(byDate).sort();
  el.innerHTML = `
    <div style="padding: 18px 16px 8px;">
      <div class="section-title">CALENDARIO</div>
      <div class="section-sub">Los 104 partidos en orden cronológico</div>
    </div>
    ${dates.map(date => `
      <div class="matchday-section">
        <div class="matchday-title">${fmtDateLong(date)}</div>
        ${byDate[date].sort((a, b) => a.hour.localeCompare(b.hour)).map(m => matchCardHTML(m, { showPred: false, showAdmin: true })).join("")}
      </div>
    `).join("")}
  `;
  attachMatchCardHandlers();
}

// ====== EQUIPOS ======
function renderTeams() {
  const el = document.getElementById("view-teams");
  el.innerHTML = `
    <div class="teams-search">
      <input type="text" id="team-search-input" placeholder="Buscar equipo…" autocomplete="off">
    </div>
    <div style="padding: 8px 18px 4px;">
      <div class="section-title">EQUIPOS</div>
      <div class="section-sub">Toca para ver ruta y estadísticas · ★ para seguir</div>
    </div>
    <div class="teams-list" id="teams-list-container"></div>
  `;

  document.getElementById("team-search-input").addEventListener("input", e => {
    renderTeamsList(e.target.value);
  });
  renderTeamsList("");
}

function renderTeamsList(query) {
  const el = document.getElementById("teams-list-container");
  const q = query.toLowerCase().trim();
  const teams = Object.values(TEAMS)
    .filter(t => !q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (teams.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="ico">🔍</div><p>Sin resultados</p></div>`;
    return;
  }

  el.innerHTML = teams.map(t => {
    const following = APP.following.includes(t.code);
    return `
      <div class="team-row" onclick="navTo('team', {teamCode: '${t.code}'})">
        <div class="flag-lg">${t.flag}</div>
        <div class="info">
          <div class="name">${t.name.toUpperCase()}</div>
          <div class="group-pill">Grupo ${t.group}</div>
        </div>
        <button class="follow-btn ${following ? 'following' : ''}" onclick="event.stopPropagation(); toggleFollow('${t.code}')">
          ${following
            ? '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Sigues'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Seguir'}
        </button>
      </div>
    `;
  }).join("");
}

function toggleFollow(code) {
  const idx = APP.following.indexOf(code);
  if (idx >= 0) {
    APP.following.splice(idx, 1);
    toast(`Dejaste de seguir a ${TEAMS[code].name}`);
  } else {
    APP.following.push(code);
    toast(`Ahora sigues a ${TEAMS[code].name}`, "success");
  }
  save();
  const searchInput = document.getElementById("team-search-input");
  const savedQuery = searchInput ? searchInput.value : "";
  renderView(APP.currentView, APP.currentParams);
  if (savedQuery && APP.currentView === "teams") {
    const newInput = document.getElementById("team-search-input");
    if (newInput) {
      newInput.value = savedQuery;
      renderTeamsList(savedQuery);
    }
  }
}

// ====== TEAM DETAIL ======
function renderTeamDetail(teamCode) {
  const el = document.getElementById("view-team");
  const team = TEAMS[teamCode];
  if (!team) { goBack(); return; }

  const following = APP.following.includes(teamCode);
  const stats = teamStats(teamCode);
  const route = teamRoute(teamCode);
  const groupTable = groupStandings(team.group);
  const teamPos = groupTable.findIndex(t => t.code === teamCode) + 1;

  // Color por grupo
  const groupGradient = team.group;

  el.innerHTML = `
    <div class="team-detail-header" style="background: var(--g-${groupGradient}, var(--g-A));">
      <button class="back-btn" onclick="goBack()" style="position: absolute; top: calc(var(--safe-top) + 12px); left: 14px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Volver
      </button>
      <div class="team-detail-flag">${team.flag}</div>
      <div class="team-detail-name">${team.name.toUpperCase()}</div>
      <div class="team-detail-group">Grupo ${team.group} · Posición actual: ${teamPos}°</div>
      <button class="team-detail-follow ${following ? 'following' : ''}" onclick="toggleFollow('${teamCode}')">
        ${following
          ? '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Siguiendo'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Seguir equipo'}
      </button>
    </div>

    <div class="stats-grid">
      <div class="stat-card"><div class="val">${stats.pj}</div><div class="lbl">PJ</div></div>
      <div class="stat-card"><div class="val win">${stats.g}</div><div class="lbl">Ganados</div></div>
      <div class="stat-card"><div class="val" style="color: var(--gold);">${stats.e}</div><div class="lbl">Empates</div></div>
      <div class="stat-card"><div class="val loss">${stats.p}</div><div class="lbl">Perdidos</div></div>
    </div>
    <div class="stats-row-2">
      <div class="stat-card"><div class="val gf">${stats.gf}</div><div class="lbl">Goles a favor</div></div>
      <div class="stat-card"><div class="val" style="color: var(--red);">${stats.gc}</div><div class="lbl">Goles contra</div></div>
      <div class="stat-card"><div class="val">${stats.dif > 0 ? '+' + stats.dif : stats.dif}</div><div class="lbl">Diferencia</div></div>
    </div>

    <div class="team-section-title">RUTA EN EL TORNEO</div>
    <div style="padding-bottom: 16px;">
      ${route.map(r => {
        const rivalTeam = r.rival ? TEAMS[r.rival] : null;
        const isKOStage = ['R32','R16','QF','SF','3P','FINAL'].includes(r.match.group);
        const stageNav = isKOStage
          ? `navTo('ko', {stageId: '${r.match.group}'})`
          : `navTo('group', {groupId: '${r.match.group}'})`;
        return `
          <div class="route-card ${r.result === 'W' ? 'win' : r.result === 'L' ? 'loss' : r.result === 'D' ? 'draw' : 'upcoming'}"
            onclick="${stageNav}">
            <div class="route-result ${r.result}">${r.result}</div>
            <div class="route-detail">
              <div class="matchup">
                ${rivalTeam ? `<span class="flag">${rivalTeam.flag}</span><span>${r.isHome ? 'vs' : '@'} ${rivalTeam.name}</span>`
                  : `<span style="font-size: 11px; color: var(--text-dim);">${r.match.placeholder || 'Por definir'}</span>`}
                <span class="score">${r.scoreText}</span>
              </div>
              <div class="meta">#${String(r.match.n).padStart(3,'0')} · ${r.match.stage} · ${fmtDate(r.match.date)} ${r.match.hour}</div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// ====== RANKING / USUARIOS ======
function renderRanking() {
  const el = document.getElementById("view-ranking");
  const ranking = userRanking();

  el.innerHTML = `
    <div class="users-view">
      <div class="section-title">RANKING</div>
      <div class="section-sub">Pollita Mundial 2026</div>

      <div class="user-add-card">
        <input type="text" id="new-user-name" placeholder="Nombre del jugador" maxlength="20">
        <button class="btn-primary" onclick="addUser()">Agregar</button>
      </div>

      ${APP.users.length === 0 ? `
        <div class="empty-state">
          <div class="ico">👥</div>
          <p>Sin jugadores aún. Agrega el primero arriba.</p>
        </div>
      ` : ranking.map((u, i) => `
        <div class="ranking-row ${u.id === APP.currentUserId ? 'current' : ''} ${i === 0 && u.pts > 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}"
          ${APP.adminMode ? `onclick="openPredictionsModal('${u.id}')" style="cursor:pointer;"` : ''}>
          <div class="rank-pos">${i + 1}°</div>
          <div class="rank-user">
            <div class="name">${u.id === APP.currentUserId ? '👤 ' : ''}${escHtml(u.name)}</div>
            <div class="stats">${u.exact} exacto${u.exact !== 1 ? 's' : ''} · ${u.outcome} resultado${u.outcome !== 1 ? 's' : ''} · ${u.total} predich${u.total !== 1 ? 'os' : 'o'}${APP.adminMode ? ' · <span style="color:var(--text-dim);font-size:10px;">toca para ver predicciones</span>' : ''}</div>
          </div>
          <div>
            <div class="rank-points">${u.pts}<small>PTS</small></div>
          </div>
          ${APP.adminMode ? `<button class="user-delete-btn" onclick="event.stopPropagation(); deleteUser('${u.id}')" title="Eliminar">✕</button>` : ''}
        </div>
      `).join("")}

      <div class="scoring-info">
        <strong>Puntajes</strong><br>
        Resultado exacto: <b>+5 pts</b> · Acierto del ganador o empate: <b>+2 pts</b> · Sin acierto: <b>0 pts</b><br>
        Las predicciones se cierran al iniciar el partido.
      </div>
    </div>
  `;
}

function openPredictionsModal(userId) {
  const user = APP.users.find(u => u.id === userId);
  if (!user) return;

  const userPreds = APP.predictions[userId] || {};
  const playedMatches = MATCHES.filter(m => APP.results[m.n]);

  const rows = playedMatches.map(m => {
    const pred  = userPreds[m.n];
    const result = APP.results[m.n];
    const score  = pred ? scorePrediction(pred, result) : null;
    const resolved = resolveMatchTeams(m.n);
    const homeTeam = resolved.home ? TEAMS[resolved.home] : null;
    const awayTeam = resolved.away ? TEAMS[resolved.away] : null;
    const teamLabel = homeTeam && awayTeam
      ? `${homeTeam.flag} ${homeTeam.name} vs ${awayTeam.flag} ${awayTeam.name}`
      : m.placeholder || `Partido #${m.n}`;

    let badgeHtml = '';
    if (!pred) {
      badgeHtml = `<span style="font-size:10px;color:var(--text-dim);font-family:'JetBrains Mono',monospace;">sin predicción</span>`;
    } else if (score?.type === 'exact') {
      badgeHtml = `<span style="color:#4ade80;font-weight:700;">✓ ${pred.h}-${pred.a} · +5 pts</span>`;
    } else if (score?.type === 'outcome') {
      badgeHtml = `<span style="color:var(--gold);font-weight:700;">✓ ${pred.h}-${pred.a} · +2 pts</span>`;
    } else {
      badgeHtml = `<span style="color:var(--red);">✗ ${pred.h}-${pred.a} · 0 pts</span>`;
    }

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);gap:8px;flex-wrap:wrap;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:11px;color:var(--text-dim);font-family:'JetBrains Mono',monospace;margin-bottom:2px;">#${String(m.n).padStart(3,'0')} · ${m.stage}</div>
          <div style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${teamLabel}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:2px;">Resultado: <strong>${result.h}-${result.a}</strong></div>
          <div style="font-size:12px;">${badgeHtml}</div>
        </div>
      </div>`;
  });

  const totalPts  = playedMatches.reduce((acc, m) => {
    const pred = userPreds[m.n];
    const sc   = pred ? scorePrediction(pred, APP.results[m.n]) : null;
    return acc + (sc?.pts || 0);
  }, 0);
  const exact   = playedMatches.filter(m => { const p = userPreds[m.n]; return p && scorePrediction(p, APP.results[m.n])?.type === 'exact'; }).length;
  const outcome = playedMatches.filter(m => { const p = userPreds[m.n]; return p && scorePrediction(p, APP.results[m.n])?.type === 'outcome'; }).length;
  const missed  = playedMatches.filter(m => { const p = userPreds[m.n]; return p && scorePrediction(p, APP.results[m.n])?.type === 'miss'; }).length;
  const noPred  = playedMatches.filter(m => !userPreds[m.n]).length;

  const modalContent = document.getElementById("modal-content");
  modalContent.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h3 style="margin:0;">${escHtml(user.name)}</h3>
      <button onclick="closeModal()" style="background:none;border:none;color:var(--text-dim);font-size:20px;cursor:pointer;padding:0;">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:14px;text-align:center;">
      <div style="background:var(--bg-app);border-radius:8px;padding:8px 4px;">
        <div style="font-size:18px;font-weight:700;color:#4ade80;">${exact}</div>
        <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;">Exactos</div>
      </div>
      <div style="background:var(--bg-app);border-radius:8px;padding:8px 4px;">
        <div style="font-size:18px;font-weight:700;color:var(--gold);">${outcome}</div>
        <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;">Resultado</div>
      </div>
      <div style="background:var(--bg-app);border-radius:8px;padding:8px 4px;">
        <div style="font-size:18px;font-weight:700;color:var(--red);">${missed}</div>
        <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;">Fallados</div>
      </div>
      <div style="background:var(--bg-app);border-radius:8px;padding:8px 4px;">
        <div style="font-size:18px;font-weight:700;">${totalPts}</div>
        <div style="font-size:9px;color:var(--text-dim);text-transform:uppercase;">Pts total</div>
      </div>
    </div>
    ${noPred > 0 ? `<div style="font-size:11px;color:var(--text-dim);margin-bottom:10px;">Sin predicción en ${noPred} partido${noPred!==1?'s':''} jugado${noPred!==1?'s':''}</div>` : ''}
    ${playedMatches.length === 0
      ? `<div style="text-align:center;padding:20px;color:var(--text-dim);">Aún no hay partidos jugados</div>`
      : `<div style="max-height:55vh;overflow-y:auto;-webkit-overflow-scrolling:touch;">${rows.join('')}</div>`}
  `;
  document.getElementById("modal-bg").classList.add("open");
}

async function addUser() {
  const input = document.getElementById("new-user-name");
  const name = input.value.trim();
  if (!name) { toast("Ingresa un nombre", "error"); return; }
  const myPlayers = getMyPlayers();
  if (!APP.adminMode && myPlayers.length >= 2) {
    toast("Ya creaste 2 jugadores desde este dispositivo", "error"); return;
  }
  if (APP.users.some(u => u.name.toLowerCase() === name.toLowerCase())) {
    toast("Ese nombre ya existe", "error"); return;
  }
  const id = uid();
  APP.users.push({ id, name });
  if (!APP.currentUserId) APP.currentUserId = id;
  input.value = "";
  save();
  // Registrar en este dispositivo (límite local)
  if (!APP.adminMode) saveMyPlayers([...getMyPlayers(), id]);
  renderRanking();
  updateUserPill();
  toast(`${name} agregado`, "success");
  try { await dbAddPlayer(id, name); }
  catch(e) { toast("Guardado localmente (sin conexión)", ""); }
}

async function deleteUser(id) {
  const u = APP.users.find(x => x.id === id);
  if (!u) return;
  if (!confirm(`¿Eliminar a ${u.name} y sus predicciones?`)) return;
  APP.users = APP.users.filter(x => x.id !== id);
  delete APP.predictions[id];
  if (APP.currentUserId === id) APP.currentUserId = APP.users[0]?.id || null;
  save();
  // Limpiar del registro local si fue creado en este dispositivo
  saveMyPlayers(getMyPlayers().filter(pid => pid !== id));
  toast(`${u.name} eliminado`);
  renderRanking();
  updateUserPill();
  try { await dbDeletePlayer(id); } catch(e) { /* estado local ya actualizado */ }
}

// ====== USER SWITCH (modal) ======
function openUserModal() {
  const modalBg = document.getElementById("modal-bg");
  const modalContent = document.getElementById("modal-content");

  if (APP.users.length === 0) {
    modalContent.innerHTML = `
      <h3>Sin jugadores</h3>
      <p>Agrega un jugador primero desde la pestaña Ranking.</p>
      <div class="modal-actions">
        <button class="btn-primary" onclick="closeModal(); navTo('ranking')">Ir a Ranking</button>
      </div>
    `;
  } else {
    // No-admin: solo puede cambiar a los jugadores que creó en este dispositivo
    const visibleUsers = APP.adminMode
      ? APP.users
      : APP.users.filter(u => getMyPlayers().includes(u.id));

    if (visibleUsers.length === 0) {
      modalContent.innerHTML = `
        <h3>Sin jugadores</h3>
        <p>Aún no has creado ningún jugador. Ve a Ranking para agregar uno.</p>
        <div class="modal-actions">
          <button class="btn-primary" onclick="closeModal(); navTo('ranking')">Ir a Ranking</button>
        </div>
      `;
    } else {
      modalContent.innerHTML = `
        <h3>Cambiar jugador</h3>
        <p>${APP.adminMode ? 'Elige quién está jugando ahora.' : 'Elige tu jugador.'}</p>
        <div class="modal-actions">
          ${visibleUsers.map(u => `
            <button class="modal-option ${u.id === APP.currentUserId ? 'active' : ''}" onclick="switchUser('${u.id}')">
              ${u.id === APP.currentUserId ? '<div class="dot"></div>' : ''}
              ${escHtml(u.name)}
            </button>
          `).join("")}
        </div>
      `;
    }
  }
  modalBg.classList.add("open");
}

function switchUser(id) {
  APP.currentUserId = id;
  save();
  closeModal();
  const u = APP.users.find(x => x.id === id);
  toast(`Ahora juegas como ${u.name}`, "success");
  renderView(APP.currentView, APP.currentParams);
  updateUserPill();
}

function closeModal() {
  document.getElementById("modal-bg").classList.remove("open");
}

function updateUserPill() {
  const pill = document.getElementById("user-pill");
  const u = APP.users.find(x => x.id === APP.currentUserId);
  if (u) {
    pill.innerHTML = `<div class="dot"></div><span>${escHtml(u.name)}</span>`;
  } else {
    pill.innerHTML = `<div class="dot" style="background: #888;"></div><span>Sin jugador</span>`;
  }
}

// ====== ADMIN PIN ======
// Para cambiar el PIN: reemplaza el valor de ADMIN_PIN_HASH
// con btoa("TU_NUEVO_PIN") en la consola del navegador.
// Ejemplo: btoa("5678") → "NTY3OA=="
const ADMIN_PIN_HASH = "NTY3OA==";

function adminExpiryLabel() {
  const local = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  const expiry = local.adminModeExpiry;
  if (!expiry) return "";
  const msLeft = expiry - Date.now();
  if (msLeft <= 0) return "Expira pronto";
  const h = Math.floor(msLeft / 3600000);
  const m = Math.floor((msLeft % 3600000) / 60000);
  return h > 0 ? `Expira en ${h}h ${m}m` : `Expira en ${m}m`;
}

function renderAdminCard() {
  if (APP.adminMode) {
    return `
      <div style="background:linear-gradient(135deg,rgba(214,40,40,0.08),var(--bg-card));border:1px solid rgba(214,40,40,0.3);border-radius:12px;padding:14px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <div style="font-weight:700;font-size:14px;display:flex;align-items:center;gap:6px;">
              <span style="color:var(--red);">●</span> Modo administrador activo
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">Puedes registrar resultados oficiales · ${adminExpiryLabel()}</div>
          </div>
          <button class="btn-secondary" style="white-space:nowrap;font-size:11px;" onclick="disableAdmin()">Desactivar</button>
        </div>
      </div>`;
  }

  return `
    <div style="background:var(--bg-card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px;">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px;">Modo administrador</div>
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:10px;">Ingresa el PIN para registrar resultados oficiales</div>
      <input type="password" id="admin-pin-input" placeholder="PIN de administrador"
        style="width:100%;background:var(--bg-app);border:1px solid var(--line-2);border-radius:8px;padding:10px 12px;font-size:14px;margin-bottom:10px;">
      <button class="btn-primary" style="width:100%;" onclick="tryEnableAdmin()">Activar</button>
    </div>`;
}

function tryEnableAdmin() {
  const pin = (document.getElementById("admin-pin-input")?.value || "").trim();
  if (!pin || btoa(unescape(encodeURIComponent(pin))) !== ADMIN_PIN_HASH) {
    toast("PIN incorrecto", "error"); return;
  }
  APP.adminMode = true;
  save();
  toast("Modo administrador activado", "success");
  renderSettings();
}

function disableAdmin() {
  APP.adminMode = false;
  save();
  toast("Modo administrador desactivado");
  renderSettings();
}

window.tryEnableAdmin = tryEnableAdmin;
window.disableAdmin   = disableAdmin;

// ====== AJUSTES ======
function toggleRulesCard() {
  const body    = document.getElementById("rules-card-body");
  const chevron = document.getElementById("rules-chevron");
  const open    = body.style.display === "none";
  body.style.display    = open ? "block" : "none";
  chevron.style.transform = open ? "rotate(90deg)" : "";
}
window.toggleRulesCard = toggleRulesCard;

function renderSettings() {
  const el = document.getElementById("view-settings");
  el.innerHTML = `
    <div class="users-view">
      <div class="section-title">AJUSTES</div>
      <div class="section-sub">Configuración general</div>

      ${renderAdminCard()}

      <div style="background: var(--bg-card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin-bottom: 12px;">
        <div style="font-weight: 700; font-size: 14px; margin-bottom: 10px;">Datos</div>
        <button class="btn-secondary" style="width: 100%; margin-bottom: 6px;" onclick="exportData()">📤 Exportar respaldo (JSON)</button>
        <button class="btn-secondary" style="width: 100%; margin-bottom: 6px;" onclick="document.getElementById('import-file').click()">📥 Importar respaldo</button>
        <input type="file" id="import-file" accept=".json" style="display: none;" onchange="importData(event)">
        <button class="btn-secondary" style="width: 100%; color: var(--red); border-color: rgba(214,40,40,0.3);" onclick="resetData()">🗑️ Borrar todos los datos</button>
      </div>

      <div style="background: var(--bg-card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin-bottom: 12px;">
        <div style="font-weight: 700; font-size: 14px; margin-bottom: 6px;">Equipos seguidos</div>
        <div style="font-size: 11px; color: var(--text-dim); margin-bottom: 8px;">${APP.following.length} equipo${APP.following.length !== 1 ? 's' : ''}</div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${APP.following.length === 0
            ? '<div style="font-size: 12px; color: var(--text-dim);">No sigues a ningún equipo aún</div>'
            : APP.following.map(code => `
              <button class="follow-btn following" onclick="toggleFollow('${code}')" style="font-size: 11px;">
                ${TEAMS[code].flag} ${TEAMS[code].name} ✕
              </button>
            `).join("")
          }
        </div>
      </div>

      <div style="background: var(--bg-card); border: 1px solid var(--line); border-radius: 12px; margin-bottom: 12px; overflow: hidden;">
        <button onclick="toggleRulesCard()" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:14px;background:none;border:none;cursor:pointer;color:inherit;">
          <span style="font-weight:700;font-size:14px;">📋 Reglas del Mundial 2026</span>
          <span id="rules-chevron" style="font-size:18px;color:var(--text-dim);transition:transform 0.2s;">›</span>
        </button>
        <div id="rules-card-body" style="display:none;padding:0 14px 14px;">

          <div style="font-size:11px;color:var(--text-dim);margin-bottom:12px;">FIFA World Cup 2026™ · Estructura y Formato Oficial</div>

          <div style="font-size:12px;font-weight:700;color:var(--red);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">1. Composición</div>
          <div style="font-size:12px;color:var(--text-soft);line-height:1.6;margin-bottom:12px;">
            <strong>48 selecciones</strong> divididas en <strong>12 grupos de 4 equipos</strong> (Grupo A al L), coorganizado por Canadá, Estados Unidos y México.
          </div>

          <div style="font-size:12px;font-weight:700;color:var(--red);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">2. Fase de Grupos</div>
          <div style="font-size:12px;color:var(--text-soft);line-height:1.6;margin-bottom:12px;">
            Todos contra todos a una sola rueda — <strong>3 partidos</strong> por equipo.<br>
            🟢 Victoria: <strong>3 pts</strong> &nbsp;·&nbsp; 🟡 Empate: <strong>1 pt</strong> &nbsp;·&nbsp; 🔴 Derrota: <strong>0 pts</strong>
          </div>

          <div style="font-size:12px;font-weight:700;color:var(--red);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">3. Clasifican a Dieciseisavos</div>
          <div style="font-size:12px;color:var(--text-soft);line-height:1.6;margin-bottom:12px;">
            <strong>32 equipos</strong> avanzan a la fase eliminatoria:<br>
            • 1° de cada grupo (12 eq.)<br>
            • 2° de cada grupo (12 eq.)<br>
            • Los <strong>8 mejores terceros</strong> de los 12 grupos
          </div>

          <div style="font-size:12px;font-weight:700;color:var(--red);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">4. Criterios de Desempate en Grupo</div>
          <div style="font-size:11px;color:var(--text-soft);line-height:1.7;margin-bottom:12px;">
            <div style="display:grid;grid-template-columns:24px 1fr;gap:3px 8px;">
              <span style="color:var(--text-dim);">1°</span><span>Diferencia de goles general (GF − GC)</span>
              <span style="color:var(--text-dim);">2°</span><span>Mayor cantidad de goles a favor</span>
              <span style="color:var(--text-dim);">3°</span><span>Puntos cara a cara entre los empatados</span>
              <span style="color:var(--text-dim);">4°</span><span>Diferencia de goles cara a cara</span>
              <span style="color:var(--text-dim);">5°</span><span>Goles a favor cara a cara</span>
              <span style="color:var(--text-dim);">6°</span><span>Fair Play: Amarilla −1 / 2ªAm −3 / Roja −4 / Am+Roja −5</span>
              <span style="color:var(--text-dim);">7°</span><span>Sorteo FIFA</span>
            </div>
          </div>

          <div style="font-size:12px;font-weight:700;color:var(--red);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">5. Mejores 8 Terceros</div>
          <div style="font-size:11px;color:var(--text-soft);line-height:1.7;margin-bottom:12px;">
            Comparación entre los 12 terceros por: Puntos → Diferencia goles → Goles a favor → Fair Play → Sorteo FIFA
          </div>

          <div style="font-size:12px;font-weight:700;color:var(--red);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">6. Fase Eliminatoria</div>
          <div style="font-size:12px;color:var(--text-soft);line-height:1.6;margin-bottom:12px;">
            Partido único por eliminación. Si hay empate a los 90 min → <strong>prórroga 2×15 min</strong>. Si persiste → <strong>penales</strong>.<br><br>
            <strong>Ruta al título (6 fases):</strong><br>
            Dieciseisavos → Octavos → Cuartos → Semis → 3er Puesto / Final<br>
            El campeón jugará <strong>8 partidos</strong> en total (3 grupos + 5 KO).
          </div>

          <div style="font-size:10px;color:var(--text-faint);font-family:'JetBrains Mono',monospace;padding-top:8px;border-top:1px solid var(--line);">
            Fuente: Reglamento Oficial FIFA 2026
          </div>
        </div>
      </div>

      <div style="background: var(--bg-card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin-bottom: 12px;">
        <div style="font-weight: 700; font-size: 14px; margin-bottom: 10px;">Legal</div>
        <button class="btn-secondary" style="width: 100%;" onclick="showTermsFromSettings()">📄 Ver Términos y Condiciones</button>
      </div>

      <div style="text-align: center; font-size: 10px; color: var(--text-faint); padding: 16px 0; font-family: 'JetBrains Mono', monospace; letter-spacing: 0.1em;">
        Pollita Mundial 2026 · v1.0<br>
        Horarios en hora Chile (CLT, UTC-4)
      </div>
    </div>
  `;

}

function exportData() {
  const data = {
    users: APP.users,
    predictions: APP.predictions,
    results: APP.results,
    following: APP.following,
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pollita-mundial2026-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Respaldo descargado", "success");
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!confirm("¿Reemplazar todos los datos actuales con el archivo?")) return;
      APP.users       = data.users       || [];
      APP.predictions = data.predictions || {};
      APP.results     = data.results     || {};
      APP.following   = data.following   || [];
      APP.currentUserId = (data.currentUserId && APP.users.some(u => u.id === data.currentUserId))
        ? data.currentUserId
        : (APP.users[0]?.id || null);
      save();
      renderView(APP.currentView, APP.currentParams);
      updateUserPill();

      if (sb) {
        toast("Sincronizando con Supabase...", "");
        try {
          await sb.from("predictions").delete().gte("match_n", 1);
          await sb.from("results").delete().gte("match_n", 1);
          await sb.from("players").delete().neq("id", "__none__");

          if (APP.users.length)
            await sb.from("players").insert(APP.users.map(u => ({ id: u.id, name: u.name })));

          const preds = [];
          Object.entries(APP.predictions).forEach(([pid, matches]) => {
            Object.entries(matches).forEach(([n, pred]) => {
              preds.push({ player_id: pid, match_n: +n, home_score: pred.h, away_score: pred.a });
            });
          });
          if (preds.length) await sb.from("predictions").insert(preds);

          const resArr = Object.entries(APP.results)
            .map(([n, r]) => ({ match_n: +n, home_score: r.h, away_score: r.a }));
          if (resArr.length) await sb.from("results").insert(resArr);

          toast("Importación completa ✓", "success");
        } catch(e2) {
          toast("Importado localmente (error en sync)", "");
        }
      } else {
        toast("Datos importados", "success");
      }
    } catch(e) {
      toast("Archivo inválido", "error");
    }
  };
  reader.readAsText(file);
}

async function resetData() {
  if (!confirm("¿Borrar TODOS los datos? Esto incluye jugadores, predicciones y resultados.")) return;
  if (!confirm("Esta acción no se puede deshacer. ¿Confirmas?")) return;
  localStorage.removeItem(STORAGE_KEY);
  APP.users = []; APP.currentUserId = null; APP.predictions = {};
  APP.results = {}; APP.following = []; APP.adminMode = false;
  renderView("home");
  updateUserPill();
  if (sb) {
    toast("Borrando datos...", "");
    try {
      await sb.from("predictions").delete().gte("match_n", 1);
      await sb.from("results").delete().gte("match_n", 1);
      await sb.from("players").delete().neq("id", "__none__");
      toast("Datos borrados ✓", "success");
    } catch(e) {
      toast("Datos borrados localmente", "");
    }
  } else {
    toast("Datos borrados", "success");
  }
}

// ====== PWA INSTALL ======
let deferredPrompt = null;

function isIOSSafari() {
  const ua = navigator.userAgent;
  // iPad/iPhone/iPod pero NO Chrome para iOS, Firefox para iOS ni Opera
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream && !/CriOS|FxiOS|OPiOS/.test(ua);
}

function showInstallBanner() {
  if (localStorage.getItem("install_dismissed")) return;
  const banner  = document.getElementById("install-banner");
  const msg     = banner.querySelector(".msg");
  const instBtn = banner.querySelector(".install-btn");

  if (isIOSSafari()) {
    msg.innerHTML = `
      <strong>Instala la app</strong>
      Toca <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="vertical-align:middle;margin:0 2px;"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
      y elige <em>"Agregar a pantalla de inicio"</em>`;
    if (instBtn) instBtn.style.display = "none";
  }
  banner.classList.add("show");
}

// Android/Chrome: escucha el prompt nativo
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;
  setTimeout(showInstallBanner, 8000);
});

function installApp() {
  if (isIOSSafari()) return; // en iOS el banner ya muestra las instrucciones
  if (!deferredPrompt) {
    toast("Para instalar: menú del navegador → 'Agregar a pantalla de inicio'", "");
    return;
  }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(choice => {
    if (choice.outcome === "accepted") toast("¡App instalada!", "success");
    document.getElementById("install-banner").classList.remove("show");
    deferredPrompt = null;
  });
}

function dismissInstall() {
  localStorage.setItem("install_dismissed", "1");
  document.getElementById("install-banner").classList.remove("show");
}

// ====== SERVICE WORKER ======
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

// ====== TÉRMINOS Y CONDICIONES ======
const TERMS_KEY = "mw26_terms_v1";

function checkTermsAccepted() {
  if (!localStorage.getItem(TERMS_KEY)) {
    document.getElementById("terms-modal").classList.add("open");
  }
}

function acceptTerms() {
  const cb  = document.getElementById("terms-checkbox");
  const err = document.getElementById("terms-error");
  if (!cb.checked) { err.style.display = "block"; return; }
  localStorage.setItem(TERMS_KEY, "1");
  document.getElementById("terms-modal").classList.remove("open");
}

function showTermsFromSettings() {
  const btn = document.getElementById("terms-close-btn");
  if (btn) btn.style.display = "block";
  document.getElementById("terms-modal").classList.add("open");
}

window.acceptTerms = acceptTerms;
window.showTermsFromSettings = showTermsFromSettings;

// ====== INIT ======
async function init() {
  checkTermsAccepted();

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => navTo(btn.dataset.target));
  });
  document.getElementById("modal-bg").addEventListener("click", e => {
    if (e.target.id === "modal-bg") closeModal();
  });
  document.getElementById("user-pill").addEventListener("click", openUserModal);

  // iOS Safari no dispara beforeinstallprompt → mostrar instrucciones manuales
  if (isIOSSafari() && !navigator.standalone) {
    setTimeout(showInstallBanner, 8000);
  }

  initSupabase();
  await dbLoad();
  navTo("home", {}, false);
  updateUserPill();
  if (sb) subscribeRealtime();
}

window.addEventListener("DOMContentLoaded", init);

// Exponer al global para handlers inline
window.navTo = navTo;
window.goBack = goBack;
window.toggleFollow = toggleFollow;
window.addUser = addUser;
window.deleteUser = deleteUser;
window.openPredictionsModal = openPredictionsModal;
window.switchUser = switchUser;
window.closeModal = closeModal;
window.exportData = exportData;
window.importData = importData;
window.resetData = resetData;
window.installApp = installApp;
window.dismissInstall = dismissInstall;
window.saveBracket = saveBracket;
window.clearBracket = clearBracket;

