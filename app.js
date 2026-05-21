// ============================================================
// MUNDIAL 2026 PWA - App Logic
// ============================================================

const APP = {
  users: [],
  currentUserId: null,
  predictions: {},   // { userId: { matchN: {h, a} } }
  results: {},       // { matchN: {h, a} }
  following: [],     // array de códigos de equipo
  adminMode: false,  // permite editar resultados
  currentView: "home",
  navigationStack: []
};

const STORAGE_KEY = "mundial2026_v1";

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
      { data: res,     error: e3 }
    ] = await Promise.all([
      sb.from("players").select("id, name").order("created_at"),
      sb.from("predictions").select("player_id, match_n, home_score, away_score"),
      sb.from("results").select("match_n, home_score, away_score")
    ]);
    if (e1 || e2 || e3) throw new Error(e1?.message || e2?.message || e3?.message);

    APP.users = players || [];

    APP.predictions = {};
    for (const p of (preds || [])) {
      if (!APP.predictions[p.player_id]) APP.predictions[p.player_id] = {};
      APP.predictions[p.player_id][p.match_n] = { h: p.home_score, a: p.away_score };
    }

    APP.results = {};
    for (const r of (res || [])) APP.results[r.match_n] = { h: r.home_score, a: r.away_score };

    // Preferencias locales (no se sincronizan entre dispositivos)
    const local = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    APP.following     = local.following  || [];
    APP.adminMode     = local.adminMode  || false;
    APP.currentUserId = (local.currentUserId && APP.users.some(u => u.id === local.currentUserId))
      ? local.currentUserId
      : (APP.users[0]?.id || null);

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

// ====== REALTIME ======
function subscribeRealtime() {
  if (!sb) return;
  if (_realtimeChannel) sb.removeChannel(_realtimeChannel);
  _realtimeChannel = sb.channel("app-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "players" },     () => dbLoad())
    .on("postgres_changes", { event: "*", schema: "public", table: "predictions" }, () => dbLoad())
    .on("postgres_changes", { event: "*", schema: "public", table: "results" },     () => dbLoad())
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
function save() {
  const data = {
    users: APP.users,
    currentUserId: APP.currentUserId,
    predictions: APP.predictions,
    results: APP.results,
    following: APP.following,
    adminMode: APP.adminMode
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
    APP.following = data.following || [];
    APP.adminMode = data.adminMode || false;
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
  `;
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
function matchCardHTML(m) {
  const home = m.home ? TEAMS[m.home] : null;
  const away = m.away ? TEAMS[m.away] : null;
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

      ${home && away ? `
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

      ${APP.adminMode && home && away ? `
        <div class="admin-result">
          <label>ADMIN · Resultado:</label>
          <input type="number" min="0" max="20" class="score-input" data-result="${m.n}" data-side="h" value="${result ? result.h : ''}">
          <span style="color: var(--text-faint);">-</span>
          <input type="number" min="0" max="20" class="score-input" data-result="${m.n}" data-side="a" value="${result ? result.a : ''}">
          <button class="btn-pred" data-save-result="${m.n}">Guardar</button>
          ${result ? `<button class="btn-pred" style="background: var(--text-dim);" data-clear-result="${m.n}">Borrar</button>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function attachMatchCardHandlers() {
  document.querySelectorAll("[data-save-pred]").forEach(btn => {
    btn.addEventListener("click", e => {
      const n = parseInt(btn.dataset.savePred);
      savePrediction(n);
    });
  });

  document.querySelectorAll("[data-save-result]").forEach(btn => {
    btn.addEventListener("click", e => {
      const n = parseInt(btn.dataset.saveResult);
      saveResult(n);
    });
  });

  document.querySelectorAll("[data-clear-result]").forEach(btn => {
    btn.addEventListener("click", async e => {
      const n = parseInt(btn.dataset.clearResult);
      delete APP.results[n];
      save();
      toast("Resultado borrado", "success");
      renderView(APP.currentView, APP.currentParams);
      try { await dbDeleteResult(n); } catch(e2) { /* estado local ya actualizado */ }
    });
  });
}

async function savePrediction(n) {
  if (!APP.currentUserId) { toast("Crea un usuario primero", "error"); return; }
  const m = getMatch(n);
  if (matchHasStarted(m)) { toast("El partido ya comenzó", "error"); return; }

  const activeView = document.querySelector(".view.active");
  const scope = activeView || document;
  const hInput = scope.querySelector(`input[data-pred="${n}"][data-side="h"]`);
  const aInput = scope.querySelector(`input[data-pred="${n}"][data-side="a"]`);
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

async function saveResult(n) {
  const activeView = document.querySelector(".view.active");
  const scope = activeView || document;
  const hInput = scope.querySelector(`input[data-result="${n}"][data-side="h"]`);
  const aInput = scope.querySelector(`input[data-result="${n}"][data-side="a"]`);
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
        ${byDate[date].sort((a, b) => a.hour.localeCompare(b.hour)).map(m => matchCardHTML(m)).join("")}
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
        <div class="ranking-row ${u.id === APP.currentUserId ? 'current' : ''} ${i === 0 && u.pts > 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}">
          <div class="rank-pos">${i + 1}°</div>
          <div class="rank-user">
            <div class="name">${u.id === APP.currentUserId ? '👤 ' : ''}${escHtml(u.name)}</div>
            <div class="stats">${u.exact} exacto${u.exact !== 1 ? 's' : ''} · ${u.outcome} resultado${u.outcome !== 1 ? 's' : ''} · ${u.total} predich${u.total !== 1 ? 'os' : 'o'}</div>
          </div>
          <div>
            <div class="rank-points">${u.pts}<small>PTS</small></div>
          </div>
          <button class="user-delete-btn" onclick="deleteUser('${u.id}')" title="Eliminar">✕</button>
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

async function addUser() {
  const input = document.getElementById("new-user-name");
  const name = input.value.trim();
  if (!name) { toast("Ingresa un nombre", "error"); return; }
  if (APP.users.some(u => u.name.toLowerCase() === name.toLowerCase())) {
    toast("Ese nombre ya existe", "error"); return;
  }
  const id = uid();
  APP.users.push({ id, name });
  if (!APP.currentUserId) APP.currentUserId = id;
  input.value = "";
  save();
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
    modalContent.innerHTML = `
      <h3>Cambiar jugador</h3>
      <p>Elige quién está jugando ahora.</p>
      <div class="modal-actions">
        ${APP.users.map(u => `
          <button class="modal-option ${u.id === APP.currentUserId ? 'active' : ''}" onclick="switchUser('${u.id}')">
            ${u.id === APP.currentUserId ? '<div class="dot"></div>' : ''}
            ${escHtml(u.name)}
          </button>
        `).join("")}
      </div>
    `;
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
const ADMIN_PIN_KEY = "mw26_admin_v1";

function renderAdminCard() {
  const pinSet = !!localStorage.getItem(ADMIN_PIN_KEY);

  if (APP.adminMode) {
    return `
      <div style="background:linear-gradient(135deg,rgba(214,40,40,0.08),var(--bg-card));border:1px solid rgba(214,40,40,0.3);border-radius:12px;padding:14px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <div style="font-weight:700;font-size:14px;display:flex;align-items:center;gap:6px;">
              <span style="color:var(--red);">●</span> Modo administrador activo
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">Puedes registrar resultados oficiales</div>
          </div>
          <button class="btn-secondary" style="white-space:nowrap;font-size:11px;" onclick="disableAdmin()">Desactivar</button>
        </div>
      </div>`;
  }

  if (!pinSet) {
    return `
      <div style="background:var(--bg-card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px;">
        <div style="font-weight:700;font-size:14px;margin-bottom:4px;">Modo administrador</div>
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:12px;">Configura un PIN para registrar resultados. Solo quien lo sepa podrá activarlo.</div>
        <input type="password" id="admin-pin-new" placeholder="Nuevo PIN (mín. 4 dígitos)"
          style="width:100%;background:var(--bg-app);border:1px solid var(--line-2);border-radius:8px;padding:10px 12px;font-size:14px;margin-bottom:8px;">
        <input type="password" id="admin-pin-confirm" placeholder="Confirmar PIN"
          style="width:100%;background:var(--bg-app);border:1px solid var(--line-2);border-radius:8px;padding:10px 12px;font-size:14px;margin-bottom:10px;">
        <button class="btn-primary" style="width:100%;" onclick="tryEnableAdmin()">Configurar PIN y activar</button>
      </div>`;
  }

  return `
    <div style="background:var(--bg-card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px;">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px;">Modo administrador</div>
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:12px;">Ingresa el PIN para registrar resultados oficiales</div>
      <input type="password" id="admin-pin-input" placeholder="PIN de administrador"
        style="width:100%;background:var(--bg-app);border:1px solid var(--line-2);border-radius:8px;padding:10px 12px;font-size:14px;margin-bottom:10px;">
      <button class="btn-primary" style="width:100%;" onclick="tryEnableAdmin()">Activar</button>
      <button style="width:100%;margin-top:8px;padding:8px;font-size:11px;color:var(--text-dim);text-align:center;" onclick="resetAdminPin()">Restablecer PIN</button>
    </div>`;
}

function tryEnableAdmin() {
  const pinSet = !!localStorage.getItem(ADMIN_PIN_KEY);

  if (!pinSet) {
    const newPin     = (document.getElementById("admin-pin-new")?.value     || "").trim();
    const confirmPin = (document.getElementById("admin-pin-confirm")?.value || "").trim();
    if (newPin.length < 4)     { toast("El PIN debe tener al menos 4 caracteres", "error"); return; }
    if (newPin !== confirmPin) { toast("Los PINs no coinciden", "error"); return; }
    localStorage.setItem(ADMIN_PIN_KEY, btoa(unescape(encodeURIComponent(newPin))));
    APP.adminMode = true;
    save();
    toast("PIN configurado · Modo admin activado", "success");
    renderSettings();
    return;
  }

  const pin    = (document.getElementById("admin-pin-input")?.value || "").trim();
  const stored = localStorage.getItem(ADMIN_PIN_KEY);
  if (!pin || btoa(unescape(encodeURIComponent(pin))) !== stored) {
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

function resetAdminPin() {
  if (!confirm("¿Resetear el PIN de administrador? Tendrás que configurar uno nuevo.")) return;
  localStorage.removeItem(ADMIN_PIN_KEY);
  APP.adminMode = false;
  save();
  toast("PIN reseteado");
  renderSettings();
}

window.tryEnableAdmin = tryEnableAdmin;
window.disableAdmin   = disableAdmin;
window.resetAdminPin  = resetAdminPin;

// ====== AJUSTES ======
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
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;
  setTimeout(() => {
    if (!localStorage.getItem("install_dismissed")) {
      document.getElementById("install-banner").classList.add("show");
    }
  }, 8000);
});

function installApp() {
  if (!deferredPrompt) {
    toast("Para instalar: menú del navegador → 'Agregar a pantalla de inicio'", "");
    return;
  }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(choice => {
    if (choice.outcome === "accepted") {
      toast("¡App instalada!", "success");
    }
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
window.switchUser = switchUser;
window.closeModal = closeModal;
window.exportData = exportData;
window.importData = importData;
window.resetData = resetData;
window.installApp = installApp;
window.dismissInstall = dismissInstall;

