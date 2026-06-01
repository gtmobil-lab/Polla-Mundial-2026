"""
sync_results.py — Sincroniza resultados del Mundial 2026 desde football-data.org hacia Supabase.

Lógica:
  - Al pitazo inicial (IN_PLAY, minuto ≥ 0): escribe 0-0 para bloquear predicciones en todos los clientes.
  - Durante el partido: actualiza el marcador cada ejecución.
  - Al terminar (FINISHED): escribe resultado final incluyendo AET y penales si aplica.
  - Pre-partido (TIMED): si el kickoff es en 45–75 min, envía notificación push.
  - Solo opera entre el 11 jun y 19 jul 2026.

Secrets requeridos en GitHub → Settings → Secrets → Actions:
  FOOTBALL_API_TOKEN   — token de football-data.org (plan gratuito)
  SUPABASE_URL         — URL del proyecto Supabase
  SUPABASE_SERVICE_KEY — service_role key (distinta a la anon key, tiene escritura sin RLS)
  VAPID_PRIVATE_KEY    — clave privada VAPID (URL-safe base64)
  VAPID_SUBJECT        — mailto: del operador (ej. mailto:admin@ejemplo.com)
"""

import json
import os
import sys
import requests
from datetime import datetime, timezone, timedelta, date

CLT = timezone(timedelta(hours=-4))  # Chile Standard Time (sin horario de verano en jun-jul)

def utc_to_clt_date(utc_date_str):
    """Convierte utcDate de la API (UTC) a fecha CLT para buscar en el FIXTURE."""
    dt = datetime.fromisoformat(utc_date_str.replace("Z", "+00:00"))
    return dt.astimezone(CLT).strftime("%Y-%m-%d")
from supabase import create_client

try:
    from pywebpush import webpush, WebPushException
    _PUSH_AVAILABLE = True
except ImportError:
    _PUSH_AVAILABLE = False

# ── Ventana del Mundial ──────────────────────────────────────────────────────
WC_START = date(2026, 6, 11)
WC_END   = date(2026, 7, 19)

# ── football-data.org: ID de la competición FIFA World Cup ───────────────────
FD_COMPETITION = "WC"
FD_BASE        = "https://api.football-data.org/v4"

# ── Mapeo football-data.org team TLA → códigos internos de la app ────────────
# Clave: TLA que devuelve la API | Valor: código en TEAMS de data.js
TEAM_MAP = {
    "MEX": "MEX", "RSA": "RSA", "KOR": "KOR", "CZE": "CZE",
    "CAN": "CAN", "BIH": "BIH", "QAT": "QAT", "SUI": "SUI",
    "BRA": "BRA", "MAR": "MAR", "HAI": "HAI", "SCO": "SCO",
    "USA": "USA", "PAR": "PAR", "AUS": "AUS", "TUR": "TUR",
    "GER": "GER", "CUW": "CUW", "CIV": "CIV", "ECU": "ECU",
    "NED": "NED", "JPN": "JPN", "SWE": "SWE", "TUN": "TUN",
    "BEL": "BEL", "EGY": "EGY", "IRN": "IRN", "NZL": "NZL",
    "ESP": "ESP", "CPV": "CPV", "KSA": "KSA", "URU": "URU",
    "FRA": "FRA", "SEN": "SEN", "IRQ": "IRQ", "NOR": "NOR",
    "ARG": "ARG", "ALG": "ALG", "AUT": "AUT", "JOR": "JOR",
    "POR": "POR", "COD": "COD", "UZB": "UZB", "COL": "COL",
    "ENG": "ENG", "CRO": "CRO", "GHA": "GHA", "PAN": "PAN",
    # Variantes alternativas que puede usar la API
    "GHA": "GHA", "CRC": "CRC", "SVN": "SVN", "DRC": "COD",
    "SCT": "SCO", "WAL": "WAL",
}

# Fixture de la app: (home_code, away_code, date_str) → match_n
# Se construye en runtime desde los datos embebidos abajo para no depender de data.js
FIXTURE = {
    ("MEX","RSA","2026-06-11"):1, ("KOR","CZE","2026-06-11"):2,
    ("CAN","BIH","2026-06-12"):3, ("USA","PAR","2026-06-12"):4,
    ("QAT","SUI","2026-06-13"):5, ("BRA","MAR","2026-06-13"):6,
    ("HAI","SCO","2026-06-13"):7, ("AUS","TUR","2026-06-14"):8,
    ("GER","CUW","2026-06-14"):9, ("NED","JPN","2026-06-14"):10,
    ("CIV","ECU","2026-06-14"):11, ("SWE","TUN","2026-06-14"):12,
    ("ESP","CPV","2026-06-15"):13, ("BEL","EGY","2026-06-15"):14,
    ("KSA","URU","2026-06-15"):15, ("IRN","NZL","2026-06-15"):16,
    ("FRA","SEN","2026-06-16"):17, ("IRQ","NOR","2026-06-16"):18,
    ("ARG","ALG","2026-06-16"):19, ("AUT","JOR","2026-06-17"):20,
    ("POR","COD","2026-06-17"):21, ("ENG","CRO","2026-06-17"):22,
    ("GHA","PAN","2026-06-17"):23, ("UZB","COL","2026-06-17"):24,
    ("CZE","RSA","2026-06-18"):25, ("SUI","BIH","2026-06-18"):26,
    ("CAN","QAT","2026-06-18"):27, ("MEX","KOR","2026-06-18"):28,
    ("USA","AUS","2026-06-19"):29, ("SCO","MAR","2026-06-19"):30,
    ("HAI","BRA","2026-06-19"):31, ("TUR","PAR","2026-06-19"):32,
    ("NED","SWE","2026-06-20"):33, ("GER","CIV","2026-06-20"):34,
    ("ECU","CUW","2026-06-20"):35, ("TUN","JPN","2026-06-20"):36,
    ("ESP","KSA","2026-06-21"):37, ("BEL","IRN","2026-06-21"):38,
    ("URU","CPV","2026-06-21"):39, ("NZL","EGY","2026-06-21"):40,
    ("ARG","AUT","2026-06-22"):41, ("FRA","IRQ","2026-06-22"):42,
    ("NOR","SEN","2026-06-22"):43, ("JOR","ALG","2026-06-23"):44,
    ("POR","UZB","2026-06-23"):45, ("ENG","GHA","2026-06-23"):46,
    ("PAN","CRO","2026-06-23"):47, ("COL","COD","2026-06-23"):48,
    ("SUI","CAN","2026-06-24"):49, ("MEX","CZE","2026-06-24"):50,
    ("RSA","KOR","2026-06-24"):51, ("BIH","QAT","2026-06-24"):52,
    ("BRA","SCO","2026-06-25"):53, ("MAR","HAI","2026-06-25"):54,
    ("PAR","AUS","2026-06-25"):55, ("USA","TUR","2026-06-25"):56,
    ("GER","ECU","2026-06-26"):57, ("CIV","CUW","2026-06-26"):58,
    ("JPN","SWE","2026-06-26"):59, ("NED","TUN","2026-06-26"):60,
    ("BEL","NZL","2026-06-26"):61, ("IRN","EGY","2026-06-26"):62,
    ("ESP","URU","2026-06-26"):63, ("KSA","CPV","2026-06-26"):64,
    ("FRA","NOR","2026-06-27"):65, ("IRQ","SEN","2026-06-27"):66,
    ("ARG","JOR","2026-06-27"):67, ("AUT","ALG","2026-06-27"):68,
    ("POR","COL","2026-06-27"):69, ("COD","UZB","2026-06-27"):70,
    ("JOR","ARG","2026-06-27"):71, ("ALG","AUT","2026-06-27"):72,
}

def get_env(key):
    val = os.environ.get(key)
    if not val:
        print(f"ERROR: falta variable de entorno {key}")
        sys.exit(1)
    return val

def fetch_matches_today():
    token = get_env("FOOTBALL_API_TOKEN")
    today = date.today().isoformat()
    url   = f"{FD_BASE}/competitions/{FD_COMPETITION}/matches"
    params = {"dateFrom": today, "dateTo": today}
    headers = {"X-Auth-Token": token}
    r = requests.get(url, params=params, headers=headers, timeout=15)
    r.raise_for_status()
    return r.json().get("matches", [])

def fetch_live_matches():
    token = get_env("FOOTBALL_API_TOKEN")
    url   = f"{FD_BASE}/competitions/{FD_COMPETITION}/matches"
    params = {"status": "LIVE"}
    headers = {"X-Auth-Token": token}
    r = requests.get(url, params=params, headers=headers, timeout=15)
    r.raise_for_status()
    return r.json().get("matches", [])

def normalize_tla(tla):
    return TEAM_MAP.get(tla, tla)

def find_match_n(home_tla, away_tla, match_date_str):
    """Busca el número de partido en el fixture de la app."""
    h = normalize_tla(home_tla)
    a = normalize_tla(away_tla)
    key = (h, a, match_date_str)
    return FIXTURE.get(key)

def parse_score(match):
    """
    Extrae scores desde la estructura de football-data.org.
    Retorna dict con h, a (90'), home_et, away_et, home_pk, away_pk.
    """
    score = match.get("score", {})
    ft    = score.get("fullTime", {})
    rt    = score.get("regularTime", {})
    et    = score.get("extraTime", {})
    pk    = score.get("penalties", {})

    # regularTime tiene el score a 90'. Si no existe, fullTime es el score final.
    if rt.get("home") is not None:
        h90 = rt["home"]
        a90 = rt["away"]
    else:
        h90 = ft.get("home")
        a90 = ft.get("away")

    # extraTime devuelve goles SOLO en el alargue. Acumulamos con 90'.
    home_et = None
    away_et = None
    if et.get("home") is not None:
        home_et = h90 + et["home"]
        away_et = a90 + et["away"]

    home_pk = pk.get("home") if pk.get("home") is not None else None
    away_pk = pk.get("away") if pk.get("away") is not None else None

    return {
        "h": h90, "a": a90,
        "home_et": home_et, "away_et": away_et,
        "home_pk": home_pk, "away_pk": away_pk,
    }

def upsert_result(sb, match_n, scores, status):
    """Hace upsert en la tabla results."""
    payload = {
        "match_n":   match_n,
        "home_score": scores["h"],
        "away_score": scores["a"],
        "home_et":    scores["home_et"],
        "away_et":    scores["away_et"],
        "home_pk":    scores["home_pk"],
        "away_pk":    scores["away_pk"],
    }
    result = sb.table("results").upsert(payload, on_conflict="match_n").execute()
    label = "✅ FINAL" if status == "FINISHED" else "🟡 EN JUEGO"
    aet = f" AET {scores['home_et']}-{scores['away_et']}" if scores['home_et'] is not None else ""
    pen = f" PEN {scores['home_pk']}-{scores['away_pk']}" if scores['home_pk'] is not None else ""
    print(f"  {label} #{match_n}: {scores['h']}-{scores['a']}{aet}{pen}")
    return result

# ── Notificaciones Push ───────────────────────────────────────────────────────

def send_push_notifications(sb, match_n, notif_type, home_code, away_code, payload):
    """Envía notificaciones push a suscriptores que siguen alguno de los equipos."""
    if not _PUSH_AVAILABLE:
        print("  ⚠️  pywebpush no disponible, omitiendo notificaciones")
        return

    vapid_key     = os.environ.get("VAPID_PRIVATE_KEY", "")
    vapid_subject = os.environ.get("VAPID_SUBJECT", "")
    if not vapid_key or not vapid_subject:
        return

    try:
        # Evitar duplicados
        log = sb.table("notifications_log").select("id").eq("match_n", match_n).eq("type", notif_type).execute()
        if log.data:
            return

        # Obtener todas las suscripciones y filtrar por equipos seguidos
        subs_res = sb.table("push_subscriptions").select("endpoint, p256dh, auth, following").execute()
        subs = [
            s for s in (subs_res.data or [])
            if home_code in (s.get("following") or []) or away_code in (s.get("following") or [])
        ]

        if not subs:
            print(f"  No hay suscriptores para {home_code} vs {away_code} ({notif_type})")
            sb.table("notifications_log").insert({"match_n": match_n, "type": notif_type}).execute()
            return

        data_bytes = json.dumps(payload).encode("utf-8")
        sent = 0
        expired = []

        for sub in subs:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub["endpoint"],
                        "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}
                    },
                    data=data_bytes,
                    vapid_private_key=vapid_key,
                    vapid_claims={"sub": vapid_subject}
                )
                sent += 1
            except WebPushException as e:
                if e.response and e.response.status_code in (404, 410):
                    expired.append(sub["endpoint"])
                else:
                    print(f"  ⚠️  Push error: {e}")

        for ep in expired:
            sb.table("push_subscriptions").delete().eq("endpoint", ep).execute()

        sb.table("notifications_log").insert({"match_n": match_n, "type": notif_type}).execute()
        print(f"  🔔 Push ({notif_type}) #{match_n}: {sent} notificaciones enviadas"
              + (f", {len(expired)} endpoints expirados eliminados" if expired else ""))

    except Exception as e:
        print(f"  ⚠️  Error en push ({notif_type}) #{match_n}: {e}")


def check_pre_match_notification(sb, match, match_n):
    """Envía notificación 'partido en 1 hora' si el kickoff es en ~45-75 min."""
    utc_date = match.get("utcDate", "")
    if not utc_date:
        return
    kickoff = datetime.fromisoformat(utc_date.replace("Z", "+00:00"))
    now     = datetime.now(timezone.utc)
    minutes = (kickoff - now).total_seconds() / 60

    if not (45 <= minutes <= 75):
        return

    home_tla  = match.get("homeTeam", {}).get("tla", "")
    away_tla  = match.get("awayTeam", {}).get("tla", "")
    home_code = normalize_tla(home_tla)
    away_code = normalize_tla(away_tla)
    home_name = match.get("homeTeam", {}).get("name", home_tla)
    away_name = match.get("awayTeam", {}).get("name", away_tla)
    kickoff_str = kickoff.strftime("%H:%M UTC")

    send_push_notifications(sb, match_n, "pre", home_code, away_code, {
        "title": "⚽ Partido en 1 hora",
        "body":  f"{home_name} vs {away_name} · {kickoff_str}",
        "url":   "/"
    })


def main():
    today = date.today()
    if today < WC_START or today > WC_END:
        print(f"Fuera del período del Mundial ({WC_START} – {WC_END}). Nada que hacer.")
        return

    supabase_url = get_env("SUPABASE_URL")
    service_key  = get_env("SUPABASE_SERVICE_KEY")
    sb = create_client(supabase_url, service_key)

    # Combina partidos del día y partidos en vivo (puede haber solapamiento)
    today_matches = fetch_matches_today()
    live_matches  = fetch_live_matches()
    all_ids = {m["id"] for m in today_matches}
    for m in live_matches:
        if m["id"] not in all_ids:
            today_matches.append(m)

    if not today_matches:
        print("No hay partidos del Mundial hoy.")
        return

    print(f"Procesando {len(today_matches)} partido(s) del {today}...")

    for match in today_matches:
        status     = match.get("status")
        home_tla   = match.get("homeTeam", {}).get("tla", "")
        away_tla   = match.get("awayTeam", {}).get("tla", "")
        match_date = utc_to_clt_date(match.get("utcDate", ""))
        match_n    = find_match_n(home_tla, away_tla, match_date)

        if match_n is None:
            print(f"  ⚠️  No mapeado: {home_tla} vs {away_tla} ({match_date}) — status:{status}")
            continue

        if status in ("IN_PLAY", "PAUSED", "HALF_TIME"):
            scores = parse_score(match)
            if scores["h"] is None:
                scores["h"] = 0
                scores["a"] = 0
            upsert_result(sb, match_n, scores, status)

        elif status == "FINISHED":
            scores = parse_score(match)
            upsert_result(sb, match_n, scores, status)
            home_code = normalize_tla(home_tla)
            away_code = normalize_tla(away_tla)
            score_str = f"{scores['h']}–{scores['a']}"
            if scores["home_et"] is not None:
                score_str += f" (AET {scores['home_et']}–{scores['away_et']})"
            if scores["home_pk"] is not None:
                score_str += f" (PEN {scores['home_pk']}–{scores['away_pk']})"
            send_push_notifications(sb, match_n, "post", home_code, away_code, {
                "title": "⚽ Resultado final",
                "body":  f"{home_tla} {score_str} {away_tla}",
                "url":   "/"
            })

        elif status == "TIMED":
            check_pre_match_notification(sb, match, match_n)
            print(f"  ⏳ #{match_n} {home_tla} vs {away_tla}: {status}")

        else:
            print(f"  ⏳ #{match_n} {home_tla} vs {away_tla}: {status}")

if __name__ == "__main__":
    main()
