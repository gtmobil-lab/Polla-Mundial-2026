# Pollita Mundial 2026 — Guía rápida

## ¿Qué hay en el ZIP?

```
mundial2026/
├── index.html              ← Pantalla principal
├── styles.css              ← Estilos (look Infobae)
├── data.js                 ← Los 104 partidos + 48 equipos + estadios + TV Chile
├── app.js                  ← Lógica de la app
├── manifest.json           ← PWA manifest
├── service-worker.js       ← Soporte offline
├── icon-192.png            ← Ícono Android
├── icon-512.png            ← Ícono Android grande
└── apple-touch-icon.png    ← Ícono iOS
```

## Para usarla — 3 opciones

### Opción A — Subirla a la web (recomendado)

Esta es la forma “real” de tener la PWA instalable en el celular. Una PWA **necesita HTTPS** para instalarse; abrir `index.html` desde el explorador local no permite la instalación.

**Las opciones gratuitas más simples:**

1. **Netlify Drop** (sin cuenta, 30 segundos):
   - Ir a https://app.netlify.com/drop
   - Arrastrar la carpeta `mundial2026/` completa
   - Listo. Obtienes una URL tipo `https://random-name.netlify.app`
   - Abres esa URL en tu celular y aparece la opción de instalar

2. **Vercel** (con tu cuenta ya conectada en Claude):
   - Subir la carpeta a un repo Git → Vercel detecta y publica
   - Plan gratis suficiente

3. **GitHub Pages**: subir a un repo público y activar Pages

### Opción B — Probarla local en el computador

```bash
cd mundial2026
python3 -m http.server 8000
# o si tienes Node:
npx http-server -p 8000
```

Abrir http://localhost:8000 en Chrome/Edge. **Limitación**: en local no se puede “Instalar app” (necesita HTTPS), pero todo lo demás funciona.

### Opción C — Verla en el celular sin instalar

Subes el ZIP a Google Drive, lo descomprimes en el teléfono y abres `index.html` con un visor HTML. Funciona pero sin las ventajas PWA (no se instala, no funciona offline).

---

## Una vez publicada en HTTPS, así se instala en el celular

**Android (Chrome):**
1. Abrir la URL
2. Menú (⋮) → “Instalar app” o “Agregar a pantalla de inicio”
3. La app aparece como un ícono más

**iPhone (Safari):**
1. Abrir la URL
2. Botón compartir (□↑) → “Agregar a pantalla de inicio”
3. Mismo resultado

---

## Cómo funciona la app

**Pestañas (barra inferior):**
- **Inicio** — 12 grupos coloridos + 6 fases eliminatorias
- **Calendario** — Los 104 partidos en orden cronológico
- **Equipos** — 48 selecciones con buscador y botón “Seguir”
- **Ranking** — Tabla de jugadores con sus aciertos
- **Ajustes** — Modo administrador, respaldo, equipos seguidos

**Flujo típico:**
1. Pestaña **Ranking** → agregar jugadores (Germán, María, etc.)
2. Tocar el “pill” arriba a la derecha → elegir quién está jugando
3. Entrar a un grupo o al calendario → poner pronóstico en cada partido y guardar
4. **Activar “Modo administrador” en Ajustes** → permite registrar los resultados reales cuando termine cada partido
5. El ranking se actualiza solo con la fórmula: **+5 pts** resultado exacto, **+2 pts** acertar ganador/empate, **0** si fallas

**Seguir equipos:**
- Tocar la estrella ⭐ junto al equipo
- Aparece la bandera ⭐ junto al nombre en cada partido donde juegue
- Al tocar el equipo: vista con bandera grande, estadísticas (PJ/G/E/P/GF/GC), ruta completa en el torneo (todos sus partidos con resultado y bandera del rival)

**Persistencia:**
- Todo se guarda en el `localStorage` del navegador de cada dispositivo
- Cada celular tiene su propia copia de jugadores, predicciones y resultados
- En Ajustes hay botones **Exportar respaldo (JSON)** e **Importar respaldo** para sincronizar manualmente entre dispositivos

**Limitación importante para una pollita compartida:**
Como los datos viven en cada celular, **un jugador en su iPhone no ve las predicciones de otro en su Android**. Si quieres una pollita realmente compartida entre amigos, la siguiente versión necesita un backend (Firebase Firestore o Supabase, ambos gratuitos hasta cierto uso). Avísame si quieres armarlo así.

---

## Notas sobre los datos

- **Horarios**: todos en hora Chile (CLT, UTC-4). En junio-julio 2026 Chile no aplica horario de verano.
- **Cruces eliminatorios**: los partidos #73 al #104 muestran “1°A vs 2°B” etc. porque los equipos exactos solo se sabrán al cerrar la fase de grupos. Sedes, fechas y horarios sí están confirmados.
- **Transmisión Chile**: cada partido muestra los broadcasters disponibles:
  - **CHV** — Chilevisión (TV abierta gratuita)
  - **DSP** — DSports / Paramount+ (los 104 partidos)
  - **D+** — Disney+ Premium (ESPN, 30 partidos seleccionados incluida la final)

---

## Personalización rápida

Si quieres cambiar algo:

- **Sistema de puntaje**: editar la función `scorePrediction` en `app.js` (línea ~85)
- **Colores de grupo**: variables `--g-A`, `--g-B`, etc. en `styles.css`
- **Agregar campo a un partido** (por ej. árbitro): agregar al objeto en `data.js` y referenciar en la función `matchCardHTML` de `app.js`
- **Modificar resultados**: con Modo Admin activo, cada partido tiene un campo extra para registrar el marcador
