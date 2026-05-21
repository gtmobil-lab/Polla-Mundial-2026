# Pollita Mundial 2026 — Resumen del Proyecto

Documento de contexto para continuar el desarrollo en una nueva sesión de chat.

---

## Descripción general

PWA (Progressive Web App) de predicciones para el Mundial FIFA 2026. Los participantes predicen resultados de los 104 partidos y acumulan puntos. Un administrador ingresa los resultados oficiales. La app sincroniza en tiempo real entre todos los dispositivos vía Supabase Realtime.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | HTML + CSS + Vanilla JS (sin frameworks) |
| Backend / DB | Supabase (PostgreSQL + RLS + Realtime) |
| Hosting | Vercel (deploy automático desde GitHub) |
| Fonts | Google Fonts (Bebas Neue, Archivo, JetBrains Mono) |
| PWA | Service Worker propio, manifest.json, íconos |

---

## Repositorio y archivos

**Repo Git:** `C:\Users\gtmob\OneDrive\Documentos\GitHub\Polla-Mundial-2026`
**Fuentes de trabajo:** `C:\Users\gtmob\OneDrive\Proyectos Claudio\APP Mundial\files\extracted\mundial2026`

> Siempre editar en el repo Git. Después de cada cambio, copiar al folder fuente con:
> `cp app.js "C:\Users\gtmob\OneDrive\Proyectos Claudio\APP Mundial\files\extracted\mundial2026\app.js"`

### Archivos principales

| Archivo | Descripción |
|---|---|
| `index.html` | Shell HTML, nav inferior, modales, overlay de carga, términos |
| `app.js` | Toda la lógica (1832 líneas) |
| `styles.css` | Estilos completos, tema claro, CSS variables (1557 líneas) |
| `data.js` | Datos estáticos: MATCHES (104), TEAMS (48), GROUPS, KO_STAGES, STADIUMS, BROADCASTERS |
| `service-worker.js` | Network-first para código app, cache-first para assets estáticos |
| `supabase-setup.sql` | Schema + RLS completo para ejecutar en Supabase SQL Editor |
| `manifest.json` | Config PWA (nombre, íconos, tema) |

---

## Base de datos — Supabase

**URL:** `https://ebasnvygazfqzkpebybw.supabase.co`
**Anon key:** `sb_publishable_6lHWN72pn_0pZ6MB36KEzg_Q0gV6z_w`
(La anon key es pública por diseño de Supabase; la seguridad real está en las RLS)

### Tablas

```sql
players      (id TEXT PK, name TEXT, created_at)
predictions  (player_id TEXT, match_n INT 1-104, home_score INT, away_score INT) PK(player_id, match_n)
results      (match_n INT PK 1-104, home_score INT, away_score INT)
brackets     (match_n INT PK 73-104, home_code TEXT, away_code TEXT)
```

### Políticas RLS (estado actual — post-seguridad)

- `players`: SELECT y INSERT públicos. DELETE solo para `auth.role() = 'authenticated'`.
- `predictions`: SELECT, INSERT y UPDATE públicos.
- `results`: SELECT público. Escritura (INSERT/UPDATE/DELETE) solo para `auth.role() = 'authenticated'`.
- `brackets`: SELECT público. Escritura solo para `auth.role() = 'authenticated'`.

### Autenticación admin

Usa **Supabase Auth** (email + contraseña). El usuario admin está creado en Supabase Dashboard → Authentication → Users. La contraseña nunca aparece en el código. La sesión JWT es verificada en el servidor en cada operación de escritura.

---

## Arquitectura de app.js

### Estado global

```js
const APP = {
  users: [],          // jugadores registrados
  currentUserId: null,
  predictions: {},    // { userId: { matchN: {h, a} } }
  results: {},        // { matchN: {h, a} }
  brackets: {},       // { matchN: { home: teamCode, away: teamCode } } — overrides admin KO
  following: [],      // array de códigos de equipo seguidos
  adminMode: false,
  currentView: "home",
  navigationStack: []
};
```

### Persistencia

- **Supabase**: `players`, `predictions`, `results`, `brackets` — sincronizados entre dispositivos
- **localStorage `mundial2026_v1`**: `following`, `adminMode`, `currentUserId` — local por dispositivo
- **localStorage `mw26_mine_v1`**: IDs de jugadores creados en este dispositivo (para límite per-device)

### Flujo de carga (`dbLoad`)

1. Fetch paralelo de las 4 tablas Supabase
2. `sb.auth.getSession()` → determina `APP.adminMode`
3. Lee preferencias locales (`following`, `currentUserId`)
4. `save()` → actualiza localStorage
5. Suscripción Realtime → cualquier cambio remoto relanza `dbLoad()`
6. `subscribeAuth()` → detecta expiración de sesión admin y revoca `adminMode`

### Sistema de puntos

```
Resultado exacto (marcador): +5 pts
Resultado correcto (ganador o empate sin marcador exacto): +2 pts
Fallo: 0 pts
Las predicciones se cierran cuando el partido comienza.
```

---

## Vistas y navegación

```
home       → Hero stats + grid grupos + grid KO stages + Fixture/Seguimiento
calendar   → 104 partidos cronológicos (SOLO admin ve inputs de resultado)
teams      → Lista 48 selecciones con búsqueda y seguimiento
ranking    → Tabla de jugadores con puntos (admin: puede eliminar + ver predicciones de cada uno)
settings   → Admin auth + Datos + Equipos seguidos + Reglas Mundial + Legal
group      → Tabla de posiciones + partidos del grupo (SOLO jugador ve inputs de predicción)
ko         → Partidos de una fase KO (SOLO jugador ve inputs de predicción)
team       → Detalle de equipo: stats + ruta en el torneo
```

### Separación calendario / grupos / KO

`matchCardHTML(m, opts)` recibe `{ showPred, showAdmin }`:
- Calendario: `{ showPred: false, showAdmin: true }` — admin ingresa resultados
- Grupos/KO: `{ showPred: true, showAdmin: false }` — jugador ingresa predicciones

---

## Funciones clave

### Bracket KO — resolución automática

```js
// R32_AUTO_MAP: mapea partidos 73-88 a posiciones de grupo (1°/2° de grupo)
// Los 8 slots de "mejores terceros" se completan manualmente por el admin
// KO_WINNER_MAP: propaga ganadores desde R32 hacia adelante
// Override admin: APP.brackets[n] tiene prioridad sobre el auto (para penales, correcciones)

resolveKOSlot(slot)    // resuelve { pos, group } | { win: n } | { lose: n }
resolveMatchTeams(n)   // devuelve { home: teamCode, away: teamCode } para cualquier partido
```

### Standings de grupo

```js
groupStandings(groupId)
// Ordena por: pts → dif → gf
// No implementa cara a cara ni fair play (simplificación aceptada)
```

### Predicciones y resultados

```js
savePrediction(n, btn)  // usa btn.closest(".pred-zone") para scopear inputs
saveResult(n, btn)      // usa btn.closest(".admin-result") para scopear inputs
// Optimistic UI: actualiza APP state primero, sync Supabase en background
```

### Límite de jugadores por dispositivo

```js
MY_PLAYERS_KEY = "mw26_mine_v1"  // IDs creados en este dispositivo, nunca se sincroniza
// Máximo 2 jugadores por dispositivo para no-admin
// Admin: sin límite
```

### Modal cambio de jugador

```js
// No-admin: solo ve los jugadores que creó en este dispositivo
// Admin: ve todos los jugadores
const visibleUsers = APP.adminMode
  ? APP.users
  : APP.users.filter(u => getMyPlayers().includes(u.id));
```

---

## Fixture / Seguimiento (pantalla Home)

Sección al final de Home con:
- Mini tabla de cada grupo (12 grupos, clic navega al grupo)
- Bracket KO horizontal scrollable con equipos resueltos automáticamente y scores

Funciones: `renderFixture()`, `renderGroupMini(groupId)`, `renderBktMatch(n)`

---

## Service Worker

`CACHE_VERSION = "v3"` (última versión deployada)

- **APP_ASSETS** (index.html, app.js, styles.css, data.js): estrategia **network-first**
- **STATIC_ASSETS** (íconos, manifest): estrategia **cache-first**
- **Google Fonts**: stale-while-revalidate
- Llamadas a Supabase: no interceptadas (pasan directo a la red)

---

## PWA / Install Banner

- **Android/Chrome**: `beforeinstallprompt` → banner nativo
- **iOS Safari**: `isIOSSafari()` detección → instrucciones manuales (toca compartir → "Agregar a pantalla de inicio")
- Se muestra 8 segundos después de cargar, solo si no fue descartado antes

---

## Seguridad implementada

| Área | Implementación |
|---|---|
| Auth admin | Supabase Auth (email + contraseña), JWT verificado en servidor |
| RLS | Escritura en results/brackets/delete players solo para sesión autenticada |
| XSS | `escHtml()` en todos los nombres de usuario renderizados en el DOM |
| SQL Injection | SDK Supabase usa queries parametrizadas, no hay concatenación |
| Session expiry | `subscribeAuth()` revoca adminMode si la sesión JWT expira |
| Scope de inputs | `btn.closest()` evita ambigüedad entre múltiples vistas en el DOM |

---

## Ajustes — Tarjeta de Reglas

En la vista Ajustes hay una tarjeta expandible "📋 Reglas del Mundial 2026" con:
- Composición (48 selecciones, 12 grupos)
- Fase de grupos (pts, dinámica)
- Clasificación a dieciseisavos
- 7 criterios de desempate
- Mejores 8 terceros
- Fase eliminatoria (prórroga + penales)

Función toggle: `toggleRulesCard()`

---

## CSS — Variables principales

```css
--bg-app: #f5f5f0      /* fondo general (tema claro) */
--bg-card: #ffffff
--text: #0a0a0a
--text-soft: #4a4a4a   /* texto de cuerpo */
--text-dim: #888
--text-faint: #b8b8b8
--red: #d62828
--gold: #f4b400
--green: #06a777
--g-A ... --g-L        /* gradientes por grupo */
```

---

## Convenciones de desarrollo

- Vanilla JS, sin frameworks, sin bundler
- Todo el estado en el objeto global `APP`
- UI siempre se re-renderiza completa llamando `renderView()`
- Optimistic UI: estado local primero, Supabase en background
- `escHtml()` obligatorio para cualquier dato de usuario que se inyecte al DOM
- Al editar: modificar en repo Git → copiar a folder fuente → commit → push
- Bump `CACHE_VERSION` en `service-worker.js` con cada deploy significativo

---

## Comandos frecuentes

```bash
# Commit y push
git add <archivos>
git commit -m "descripción"
git push origin main

# Copiar desde repo a fuente
cp app.js "C:\Users\gtmob\OneDrive\Proyectos Claudio\APP Mundial\files\extracted\mundial2026\app.js"
cp styles.css "C:\Users\gtmob\OneDrive\Proyectos Claudio\APP Mundial\files\extracted\mundial2026\styles.css"

# Ver estado
git log --oneline
git diff --stat
```

---

## Pendientes / Mejoras futuras

- SRI (Subresource Integrity) para el CDN de Supabase en index.html
- Content Security Policy en vercel.json
- Tabla audit_log en Supabase para registrar cambios de resultados
- Criterios de desempate cara a cara en groupStandings()
- Self-host fuentes Google para eliminar dependencia externa
