// ============================================================
// MUNDIAL FIFA 2026 - DATA
// Fixture completo: 104 partidos | 48 selecciones | 12 grupos
// Horarios en CLT (Chile, UTC-4 horario de invierno) — 1 h DETRÁS de ARG en jun-jul 2026
// Transmisión: CHV (TV abierta) | DSP (DSports/Paramount+) | D+ (Disney+ Premium)
// ============================================================

const TEAMS = {
  // Grupo A
  MEX: { name: "México", flag: "🇲🇽", code: "MEX", group: "A" },
  RSA: { name: "Sudáfrica", flag: "🇿🇦", code: "RSA", group: "A" },
  KOR: { name: "Corea del Sur", flag: "🇰🇷", code: "KOR", group: "A" },
  CZE: { name: "República Checa", flag: "🇨🇿", code: "CZE", group: "A" },
  // Grupo B
  CAN: { name: "Canadá", flag: "🇨🇦", code: "CAN", group: "B" },
  BIH: { name: "Bosnia-Herzegovina", flag: "🇧🇦", code: "BIH", group: "B" },
  QAT: { name: "Qatar", flag: "🇶🇦", code: "QAT", group: "B" },
  SUI: { name: "Suiza", flag: "🇨🇭", code: "SUI", group: "B" },
  // Grupo C
  BRA: { name: "Brasil", flag: "🇧🇷", code: "BRA", group: "C" },
  MAR: { name: "Marruecos", flag: "🇲🇦", code: "MAR", group: "C" },
  HAI: { name: "Haití", flag: "🇭🇹", code: "HAI", group: "C" },
  SCO: { name: "Escocia", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", code: "SCO", group: "C" },
  // Grupo D
  USA: { name: "Estados Unidos", flag: "🇺🇸", code: "USA", group: "D" },
  PAR: { name: "Paraguay", flag: "🇵🇾", code: "PAR", group: "D" },
  AUS: { name: "Australia", flag: "🇦🇺", code: "AUS", group: "D" },
  TUR: { name: "Turquía", flag: "🇹🇷", code: "TUR", group: "D" },
  // Grupo E
  GER: { name: "Alemania", flag: "🇩🇪", code: "GER", group: "E" },
  CUW: { name: "Curazao", flag: "🇨🇼", code: "CUW", group: "E" },
  CIV: { name: "Costa de Marfil", flag: "🇨🇮", code: "CIV", group: "E" },
  ECU: { name: "Ecuador", flag: "🇪🇨", code: "ECU", group: "E" },
  // Grupo F
  NED: { name: "Países Bajos", flag: "🇳🇱", code: "NED", group: "F" },
  JPN: { name: "Japón", flag: "🇯🇵", code: "JPN", group: "F" },
  SWE: { name: "Suecia", flag: "🇸🇪", code: "SWE", group: "F" },
  TUN: { name: "Túnez", flag: "🇹🇳", code: "TUN", group: "F" },
  // Grupo G
  BEL: { name: "Bélgica", flag: "🇧🇪", code: "BEL", group: "G" },
  EGY: { name: "Egipto", flag: "🇪🇬", code: "EGY", group: "G" },
  IRN: { name: "Irán", flag: "🇮🇷", code: "IRN", group: "G" },
  NZL: { name: "Nueva Zelanda", flag: "🇳🇿", code: "NZL", group: "G" },
  // Grupo H
  ESP: { name: "España", flag: "🇪🇸", code: "ESP", group: "H" },
  CPV: { name: "Cabo Verde", flag: "🇨🇻", code: "CPV", group: "H" },
  KSA: { name: "Arabia Saudita", flag: "🇸🇦", code: "KSA", group: "H" },
  URU: { name: "Uruguay", flag: "🇺🇾", code: "URU", group: "H" },
  // Grupo I
  FRA: { name: "Francia", flag: "🇫🇷", code: "FRA", group: "I" },
  SEN: { name: "Senegal", flag: "🇸🇳", code: "SEN", group: "I" },
  IRQ: { name: "Irak", flag: "🇮🇶", code: "IRQ", group: "I" },
  NOR: { name: "Noruega", flag: "🇳🇴", code: "NOR", group: "I" },
  // Grupo J
  ARG: { name: "Argentina", flag: "🇦🇷", code: "ARG", group: "J" },
  ALG: { name: "Argelia", flag: "🇩🇿", code: "ALG", group: "J" },
  AUT: { name: "Austria", flag: "🇦🇹", code: "AUT", group: "J" },
  JOR: { name: "Jordania", flag: "🇯🇴", code: "JOR", group: "J" },
  // Grupo K
  POR: { name: "Portugal", flag: "🇵🇹", code: "POR", group: "K" },
  COD: { name: "Rep. Dem. del Congo", flag: "🇨🇩", code: "COD", group: "K" },
  UZB: { name: "Uzbekistán", flag: "🇺🇿", code: "UZB", group: "K" },
  COL: { name: "Colombia", flag: "🇨🇴", code: "COL", group: "K" },
  // Grupo L
  ENG: { name: "Inglaterra", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", code: "ENG", group: "L" },
  CRO: { name: "Croacia", flag: "🇭🇷", code: "CRO", group: "L" },
  GHA: { name: "Ghana", flag: "🇬🇭", code: "GHA", group: "L" },
  PAN: { name: "Panamá", flag: "🇵🇦", code: "PAN", group: "L" }
};

// Códigos: c=CHV, d=DSP/Paramount+, p=Disney+ Premium
// Estadios FIFA (sin sponsors)
const STADIUMS = {
  azteca: { name: "Estadio Azteca", city: "Ciudad de México", country: "MEX" },
  guadalajara: { name: "Estadio Guadalajara", city: "Guadalajara", country: "MEX" },
  monterrey: { name: "Estadio Monterrey", city: "Monterrey", country: "MEX" },
  toronto: { name: "Toronto Stadium", city: "Toronto", country: "CAN" },
  vancouver: { name: "BC Place Vancouver", city: "Vancouver", country: "CAN" },
  losangeles: { name: "Los Angeles Stadium", city: "Inglewood, CA", country: "USA" },
  sfbay: { name: "San Francisco Bay Area Stadium", city: "Santa Clara, CA", country: "USA" },
  seattle: { name: "Seattle Stadium", city: "Seattle", country: "USA" },
  dallas: { name: "Dallas Stadium", city: "Arlington, TX", country: "USA" },
  kansas: { name: "Kansas City Stadium", city: "Kansas City, MO", country: "USA" },
  houston: { name: "Houston Stadium", city: "Houston, TX", country: "USA" },
  atlanta: { name: "Atlanta Stadium", city: "Atlanta, GA", country: "USA" },
  miami: { name: "Miami Stadium", city: "Miami Gardens, FL", country: "USA" },
  philadelphia: { name: "Philadelphia Stadium", city: "Filadelfia, PA", country: "USA" },
  boston: { name: "Boston Stadium", city: "Foxborough, MA", country: "USA" },
  nynj: { name: "New York New Jersey Stadium", city: "East Rutherford, NJ", country: "USA" }
};

// Partidos (104) — fase de grupos + eliminatorias
// hora: hora Chile (CLT, UTC-4) en formato 24h
// tv: array con códigos de transmisión [c=CHV, d=DSP, p=D+]
const MATCHES = [
  // ===== JORNADA 1 — Grupos =====
  { n: 1, date: "2026-06-11", hour: "15:00", home: "MEX", away: "RSA", stage: "Grupo A", group: "A", stadium: "azteca", tv: ["c","d","p"] },
  { n: 2, date: "2026-06-11", hour: "22:00", home: "KOR", away: "CZE", stage: "Grupo A", group: "A", stadium: "guadalajara", tv: ["d"] },
  { n: 3, date: "2026-06-12", hour: "15:00", home: "CAN", away: "BIH", stage: "Grupo B", group: "B", stadium: "toronto", tv: ["c","d"] },
  { n: 4, date: "2026-06-12", hour: "21:00", home: "USA", away: "PAR", stage: "Grupo D", group: "D", stadium: "losangeles", tv: ["c","d","p"] },
  { n: 5, date: "2026-06-13", hour: "15:00", home: "QAT", away: "SUI", stage: "Grupo B", group: "B", stadium: "sfbay", tv: ["c","d"] },
  { n: 6, date: "2026-06-13", hour: "18:00", home: "BRA", away: "MAR", stage: "Grupo C", group: "C", stadium: "nynj", tv: ["c","d","p"] },
  { n: 7, date: "2026-06-13", hour: "21:00", home: "HAI", away: "SCO", stage: "Grupo C", group: "C", stadium: "boston", tv: ["d"] },
  { n: 8, date: "2026-06-14", hour: "00:00", home: "AUS", away: "TUR", stage: "Grupo D", group: "D", stadium: "vancouver", tv: ["d"] },
  { n: 9, date: "2026-06-14", hour: "13:00", home: "GER", away: "CUW", stage: "Grupo E", group: "E", stadium: "houston", tv: ["d"] },
  { n: 10, date: "2026-06-14", hour: "16:00", home: "NED", away: "JPN", stage: "Grupo F", group: "F", stadium: "dallas", tv: ["c","d"] },
  { n: 11, date: "2026-06-14", hour: "19:00", home: "CIV", away: "ECU", stage: "Grupo E", group: "E", stadium: "philadelphia", tv: ["c","d","p"] },
  { n: 12, date: "2026-06-14", hour: "22:00", home: "SWE", away: "TUN", stage: "Grupo F", group: "F", stadium: "monterrey", tv: ["d"] },
  { n: 13, date: "2026-06-15", hour: "12:00", home: "ESP", away: "CPV", stage: "Grupo H", group: "H", stadium: "atlanta", tv: ["d"] },
  { n: 14, date: "2026-06-15", hour: "15:00", home: "BEL", away: "EGY", stage: "Grupo G", group: "G", stadium: "seattle", tv: ["c","d"] },
  { n: 15, date: "2026-06-15", hour: "18:00", home: "KSA", away: "URU", stage: "Grupo H", group: "H", stadium: "miami", tv: ["d","p"] },
  { n: 16, date: "2026-06-15", hour: "21:00", home: "IRN", away: "NZL", stage: "Grupo G", group: "G", stadium: "losangeles", tv: ["d"] },
  { n: 17, date: "2026-06-16", hour: "15:00", home: "FRA", away: "SEN", stage: "Grupo I", group: "I", stadium: "nynj", tv: ["c","d","p"] },
  { n: 18, date: "2026-06-16", hour: "18:00", home: "IRQ", away: "NOR", stage: "Grupo I", group: "I", stadium: "boston", tv: ["d"] },
  { n: 19, date: "2026-06-16", hour: "21:00", home: "ARG", away: "ALG", stage: "Grupo J", group: "J", stadium: "kansas", tv: ["c","d","p"] },
  { n: 20, date: "2026-06-17", hour: "00:00", home: "AUT", away: "JOR", stage: "Grupo J", group: "J", stadium: "sfbay", tv: ["d"] },
  { n: 21, date: "2026-06-17", hour: "13:00", home: "POR", away: "COD", stage: "Grupo K", group: "K", stadium: "houston", tv: ["d"] },
  { n: 22, date: "2026-06-17", hour: "16:00", home: "ENG", away: "CRO", stage: "Grupo L", group: "L", stadium: "dallas", tv: ["c","d","p"] },
  { n: 23, date: "2026-06-17", hour: "19:00", home: "GHA", away: "PAN", stage: "Grupo L", group: "L", stadium: "toronto", tv: ["d"] },
  { n: 24, date: "2026-06-17", hour: "22:00", home: "UZB", away: "COL", stage: "Grupo K", group: "K", stadium: "azteca", tv: ["c","d","p"] },

  // ===== JORNADA 2 — Grupos =====
  { n: 25, date: "2026-06-18", hour: "12:00", home: "CZE", away: "RSA", stage: "Grupo A", group: "A", stadium: "atlanta", tv: ["d"] },
  { n: 26, date: "2026-06-18", hour: "15:00", home: "SUI", away: "BIH", stage: "Grupo B", group: "B", stadium: "losangeles", tv: ["c","d"] },
  { n: 27, date: "2026-06-18", hour: "18:00", home: "CAN", away: "QAT", stage: "Grupo B", group: "B", stadium: "vancouver", tv: ["c","d"] },
  { n: 28, date: "2026-06-18", hour: "21:00", home: "MEX", away: "KOR", stage: "Grupo A", group: "A", stadium: "guadalajara", tv: ["c","d","p"] },
  { n: 29, date: "2026-06-19", hour: "15:00", home: "USA", away: "AUS", stage: "Grupo D", group: "D", stadium: "seattle", tv: ["c","d","p"] },
  { n: 30, date: "2026-06-19", hour: "18:00", home: "SCO", away: "MAR", stage: "Grupo C", group: "C", stadium: "philadelphia", tv: ["d","p"] },
  { n: 31, date: "2026-06-19", hour: "21:00", home: "HAI", away: "BRA", stage: "Grupo C", group: "C", stadium: "boston", tv: ["d","p"] },
  { n: 32, date: "2026-06-20", hour: "00:00", home: "TUR", away: "PAR", stage: "Grupo D", group: "D", stadium: "sfbay", tv: ["d"] },
  { n: 33, date: "2026-06-20", hour: "13:00", home: "NED", away: "SWE", stage: "Grupo F", group: "F", stadium: "houston", tv: ["d"] },
  { n: 34, date: "2026-06-20", hour: "16:00", home: "GER", away: "CIV", stage: "Grupo E", group: "E", stadium: "toronto", tv: ["c","d"] },
  { n: 35, date: "2026-06-20", hour: "20:00", home: "ECU", away: "CUW", stage: "Grupo E", group: "E", stadium: "kansas", tv: ["c","d","p"] },
  { n: 36, date: "2026-06-21", hour: "00:00", home: "TUN", away: "JPN", stage: "Grupo F", group: "F", stadium: "monterrey", tv: ["c","d"] },
  { n: 37, date: "2026-06-21", hour: "12:00", home: "ESP", away: "KSA", stage: "Grupo H", group: "H", stadium: "atlanta", tv: ["c","d"] },
  { n: 38, date: "2026-06-21", hour: "15:00", home: "BEL", away: "IRN", stage: "Grupo G", group: "G", stadium: "losangeles", tv: ["d"] },
  { n: 39, date: "2026-06-21", hour: "18:00", home: "URU", away: "CPV", stage: "Grupo H", group: "H", stadium: "miami", tv: ["c","d","p"] },
  { n: 40, date: "2026-06-21", hour: "21:00", home: "NZL", away: "EGY", stage: "Grupo G", group: "G", stadium: "vancouver", tv: ["d"] },
  { n: 41, date: "2026-06-22", hour: "13:00", home: "ARG", away: "AUT", stage: "Grupo J", group: "J", stadium: "dallas", tv: ["c","d","p"] },
  { n: 42, date: "2026-06-22", hour: "17:00", home: "FRA", away: "IRQ", stage: "Grupo I", group: "I", stadium: "philadelphia", tv: ["d"] },
  { n: 43, date: "2026-06-22", hour: "20:00", home: "NOR", away: "SEN", stage: "Grupo I", group: "I", stadium: "nynj", tv: ["c","d"] },
  { n: 44, date: "2026-06-22", hour: "23:00", home: "JOR", away: "ALG", stage: "Grupo J", group: "J", stadium: "sfbay", tv: ["d"] },
  { n: 45, date: "2026-06-23", hour: "13:00", home: "POR", away: "UZB", stage: "Grupo K", group: "K", stadium: "houston", tv: ["c","d"] },
  { n: 46, date: "2026-06-23", hour: "16:00", home: "ENG", away: "GHA", stage: "Grupo L", group: "L", stadium: "boston", tv: ["c","d"] },
  { n: 47, date: "2026-06-23", hour: "19:00", home: "PAN", away: "CRO", stage: "Grupo L", group: "L", stadium: "toronto", tv: ["c","d"] },
  { n: 48, date: "2026-06-23", hour: "22:00", home: "COL", away: "COD", stage: "Grupo K", group: "K", stadium: "guadalajara", tv: ["c","d","p"] },

  // ===== JORNADA 3 — Grupos =====
  { n: 49, date: "2026-06-24", hour: "15:00", home: "SUI", away: "CAN", stage: "Grupo B", group: "B", stadium: "vancouver", tv: ["d"] },
  { n: 50, date: "2026-06-24", hour: "15:00", home: "BIH", away: "QAT", stage: "Grupo B", group: "B", stadium: "seattle", tv: ["d"] },
  { n: 51, date: "2026-06-24", hour: "18:00", home: "SCO", away: "BRA", stage: "Grupo C", group: "C", stadium: "miami", tv: ["c","d","p"] },
  { n: 52, date: "2026-06-24", hour: "18:00", home: "MAR", away: "HAI", stage: "Grupo C", group: "C", stadium: "atlanta", tv: ["d"] },
  { n: 53, date: "2026-06-24", hour: "21:00", home: "CZE", away: "MEX", stage: "Grupo A", group: "A", stadium: "azteca", tv: ["c","d","p"] },
  { n: 54, date: "2026-06-24", hour: "21:00", home: "RSA", away: "KOR", stage: "Grupo A", group: "A", stadium: "monterrey", tv: ["d"] },
  { n: 55, date: "2026-06-25", hour: "16:00", home: "CUW", away: "CIV", stage: "Grupo E", group: "E", stadium: "philadelphia", tv: ["d"] },
  { n: 56, date: "2026-06-25", hour: "16:00", home: "ECU", away: "GER", stage: "Grupo E", group: "E", stadium: "nynj", tv: ["c","d","p"] },
  { n: 57, date: "2026-06-25", hour: "19:00", home: "JPN", away: "SWE", stage: "Grupo F", group: "F", stadium: "dallas", tv: ["d"] },
  { n: 58, date: "2026-06-25", hour: "19:00", home: "TUN", away: "NED", stage: "Grupo F", group: "F", stadium: "kansas", tv: ["c","d"] },
  { n: 59, date: "2026-06-25", hour: "22:00", home: "TUR", away: "USA", stage: "Grupo D", group: "D", stadium: "losangeles", tv: ["d"] },
  { n: 60, date: "2026-06-25", hour: "22:00", home: "PAR", away: "AUS", stage: "Grupo D", group: "D", stadium: "sfbay", tv: ["c","d","p"] },
  { n: 61, date: "2026-06-26", hour: "15:00", home: "NOR", away: "FRA", stage: "Grupo I", group: "I", stadium: "boston", tv: ["c","d","p"] },
  { n: 62, date: "2026-06-26", hour: "15:00", home: "SEN", away: "IRQ", stage: "Grupo I", group: "I", stadium: "toronto", tv: ["d"] },
  { n: 63, date: "2026-06-26", hour: "20:00", home: "CPV", away: "KSA", stage: "Grupo H", group: "H", stadium: "houston", tv: ["d"] },
  { n: 64, date: "2026-06-26", hour: "20:00", home: "URU", away: "ESP", stage: "Grupo H", group: "H", stadium: "guadalajara", tv: ["c","d","p"] },
  { n: 65, date: "2026-06-26", hour: "23:00", home: "EGY", away: "IRN", stage: "Grupo G", group: "G", stadium: "seattle", tv: ["d"] },
  { n: 66, date: "2026-06-26", hour: "23:00", home: "NZL", away: "BEL", stage: "Grupo G", group: "G", stadium: "vancouver", tv: ["d"] },
  { n: 67, date: "2026-06-27", hour: "17:00", home: "ENG", away: "PAN", stage: "Grupo L", group: "L", stadium: "nynj", tv: ["d"] },
  { n: 68, date: "2026-06-27", hour: "17:00", home: "CRO", away: "GHA", stage: "Grupo L", group: "L", stadium: "philadelphia", tv: ["d"] },
  { n: 69, date: "2026-06-27", hour: "19:30", home: "POR", away: "COL", stage: "Grupo K", group: "K", stadium: "miami", tv: ["c","d","p"] },
  { n: 70, date: "2026-06-27", hour: "19:30", home: "COD", away: "UZB", stage: "Grupo K", group: "K", stadium: "atlanta", tv: ["d"] },
  { n: 71, date: "2026-06-27", hour: "22:00", home: "JOR", away: "ARG", stage: "Grupo J", group: "J", stadium: "dallas", tv: ["c","d","p"] },
  { n: 72, date: "2026-06-27", hour: "22:00", home: "ALG", away: "AUT", stage: "Grupo J", group: "J", stadium: "kansas", tv: ["d"] },

  // ===== DIECISEISAVOS — Ronda de 32 (los equipos dependen del orden final) =====
  { n: 73, date: "2026-06-28", hour: "15:00", home: null, away: null, placeholder: "2°A vs 2°B", stage: "Dieciseisavos", group: "R32", stadium: "losangeles", tv: ["d"] },
  { n: 74, date: "2026-06-29", hour: "16:30", home: null, away: null, placeholder: "1°E vs 3° (A/B/C/D/F)", stage: "Dieciseisavos", group: "R32", stadium: "boston", tv: ["d"] },
  { n: 75, date: "2026-06-29", hour: "21:00", home: null, away: null, placeholder: "1°F vs 2°C", stage: "Dieciseisavos", group: "R32", stadium: "monterrey", tv: ["d"] },
  { n: 76, date: "2026-06-29", hour: "13:00", home: null, away: null, placeholder: "1°C vs 2°F", stage: "Dieciseisavos", group: "R32", stadium: "houston", tv: ["d"] },
  { n: 77, date: "2026-06-30", hour: "17:00", home: null, away: null, placeholder: "1°I vs 3° (C/D/F/G/H)", stage: "Dieciseisavos", group: "R32", stadium: "nynj", tv: ["d","p"] },
  { n: 78, date: "2026-06-30", hour: "13:00", home: null, away: null, placeholder: "2°E vs 2°I", stage: "Dieciseisavos", group: "R32", stadium: "dallas", tv: ["d"] },
  { n: 79, date: "2026-06-30", hour: "21:00", home: null, away: null, placeholder: "1°A vs 3° (C/E/F/H/I)", stage: "Dieciseisavos", group: "R32", stadium: "azteca", tv: ["c","d"] },
  { n: 80, date: "2026-07-01", hour: "12:00", home: null, away: null, placeholder: "1°L vs 3° (E/H/I/J/K)", stage: "Dieciseisavos", group: "R32", stadium: "atlanta", tv: ["d"] },
  { n: 81, date: "2026-07-01", hour: "20:00", home: null, away: null, placeholder: "1°D vs 3° (B/E/F/I/J)", stage: "Dieciseisavos", group: "R32", stadium: "sfbay", tv: ["c","d"] },
  { n: 82, date: "2026-07-01", hour: "16:00", home: null, away: null, placeholder: "1°G vs 3° (A/E/H/I/J)", stage: "Dieciseisavos", group: "R32", stadium: "seattle", tv: ["d"] },
  { n: 83, date: "2026-07-02", hour: "19:00", home: null, away: null, placeholder: "2°K vs 2°L", stage: "Dieciseisavos", group: "R32", stadium: "toronto", tv: ["d"] },
  { n: 84, date: "2026-07-02", hour: "15:00", home: null, away: null, placeholder: "1°H vs 2°J", stage: "Dieciseisavos", group: "R32", stadium: "losangeles", tv: ["d","p"] },
  { n: 85, date: "2026-07-02", hour: "23:00", home: null, away: null, placeholder: "1°B vs 3° (E/F/G/I/J)", stage: "Dieciseisavos", group: "R32", stadium: "vancouver", tv: ["d"] },
  { n: 86, date: "2026-07-03", hour: "18:00", home: null, away: null, placeholder: "1°J vs 2°H", stage: "Dieciseisavos", group: "R32", stadium: "miami", tv: ["c","d"] },
  { n: 87, date: "2026-07-03", hour: "21:30", home: null, away: null, placeholder: "1°K vs 3° (D/E/I/J/L)", stage: "Dieciseisavos", group: "R32", stadium: "kansas", tv: ["d"] },
  { n: 88, date: "2026-07-03", hour: "14:00", home: null, away: null, placeholder: "2°D vs 2°G", stage: "Dieciseisavos", group: "R32", stadium: "dallas", tv: ["d"] },

  // ===== OCTAVOS =====
  { n: 89, date: "2026-07-04", hour: "17:00", home: null, away: null, placeholder: "G74 vs G77", stage: "Octavos", group: "R16", stadium: "philadelphia", tv: ["c","d"] },
  { n: 90, date: "2026-07-04", hour: "13:00", home: null, away: null, placeholder: "G73 vs G75", stage: "Octavos", group: "R16", stadium: "houston", tv: ["d","p"] },
  { n: 91, date: "2026-07-05", hour: "16:00", home: null, away: null, placeholder: "G76 vs G78", stage: "Octavos", group: "R16", stadium: "nynj", tv: ["c","d","p"] },
  { n: 92, date: "2026-07-05", hour: "20:00", home: null, away: null, placeholder: "G79 vs G80", stage: "Octavos", group: "R16", stadium: "azteca", tv: ["c","d"] },
  { n: 93, date: "2026-07-06", hour: "15:00", home: null, away: null, placeholder: "G83 vs G84", stage: "Octavos", group: "R16", stadium: "dallas", tv: ["d"] },
  { n: 94, date: "2026-07-06", hour: "20:00", home: null, away: null, placeholder: "G81 vs G82", stage: "Octavos", group: "R16", stadium: "seattle", tv: ["c","d"] },
  { n: 95, date: "2026-07-07", hour: "12:00", home: null, away: null, placeholder: "G86 vs G88", stage: "Octavos", group: "R16", stadium: "atlanta", tv: ["d"] },
  { n: 96, date: "2026-07-07", hour: "16:00", home: null, away: null, placeholder: "G85 vs G87", stage: "Octavos", group: "R16", stadium: "vancouver", tv: ["c","d"] },

  // ===== CUARTOS =====
  { n: 97, date: "2026-07-09", hour: "16:00", home: null, away: null, placeholder: "G89 vs G90", stage: "Cuartos", group: "QF", stadium: "boston", tv: ["c","d","p"] },
  { n: 98, date: "2026-07-10", hour: "15:00", home: null, away: null, placeholder: "G93 vs G94", stage: "Cuartos", group: "QF", stadium: "losangeles", tv: ["c","d"] },
  { n: 99, date: "2026-07-11", hour: "17:00", home: null, away: null, placeholder: "G91 vs G92", stage: "Cuartos", group: "QF", stadium: "miami", tv: ["c","d"] },
  { n: 100, date: "2026-07-11", hour: "21:00", home: null, away: null, placeholder: "G95 vs G96", stage: "Cuartos", group: "QF", stadium: "kansas", tv: ["c","d"] },

  // ===== SEMIFINALES =====
  { n: 101, date: "2026-07-14", hour: "15:00", home: null, away: null, placeholder: "G97 vs G98", stage: "Semifinal", group: "SF", stadium: "dallas", tv: ["c","d","p"] },
  { n: 102, date: "2026-07-15", hour: "15:00", home: null, away: null, placeholder: "G99 vs G100", stage: "Semifinal", group: "SF", stadium: "atlanta", tv: ["c","d","p"] },

  // ===== TERCER PUESTO =====
  { n: 103, date: "2026-07-18", hour: "17:00", home: null, away: null, placeholder: "Perdedor SF1 vs Perdedor SF2", stage: "Tercer Puesto", group: "3P", stadium: "miami", tv: ["c","d","p"] },

  // ===== FINAL =====
  { n: 104, date: "2026-07-19", hour: "15:00", home: null, away: null, placeholder: "Ganador SF1 vs Ganador SF2", stage: "FINAL", group: "FINAL", stadium: "nynj", tv: ["c","d","p"] }
];

// Información de transmisores
const BROADCASTERS = {
  c: { code: "CHV", name: "Chilevisión", type: "TV abierta", url: "https://www.chilevision.cl", color: "chv" },
  d: { code: "DSP", name: "DSports / Paramount+", type: "Cable / Streaming", url: "https://www.paramountplus.com/cl/", color: "dsp" },
  p: { code: "D+", name: "Disney+ Premium (ESPN)", type: "Streaming", url: "https://www.disneyplus.com/es-cl", color: "dp" }
};

// Grupos en orden
const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

// Fases eliminatorias
const KO_STAGES = [
  { id: "R32", name: "Dieciseisavos", short: "1/16", range: [73, 88] },
  { id: "R16", name: "Octavos", short: "1/8", range: [89, 96] },
  { id: "QF", name: "Cuartos", short: "1/4", range: [97, 100] },
  { id: "SF", name: "Semifinales", short: "SF", range: [101, 102] },
  { id: "3P", name: "Tercer Puesto", short: "3°", range: [103, 103] },
  { id: "FINAL", name: "Final", short: "FINAL", range: [104, 104] }
];
