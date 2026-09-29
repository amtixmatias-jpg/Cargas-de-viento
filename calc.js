/*
 * Motor de cálculo – NCh 432 Of2025 (cargas de viento)
 * Funciones puras, sin DOM. Se usan desde index.html y desde test/calc.test.js.
 *
 * Convención de presiones (igual a la planilla CARGAS.xlsx, hoja VIENTO):
 *   q(z) = 0,613 · I · Kz · Kzt · Ke · V²                 [N/m²]
 *   p    = q · Kd · G · Cp  −  qh · Kd · (GCpi)            [N/m²]   (método direccional)
 *   p    = qh · Kd · [(GCpf) − (GCpi)]                     [N/m²]   (método simplificado / envolvente)
 * Signo +: presión hacia la superficie; signo −: succión (alejándose).
 */
(function (root) {
  'use strict';

  const G_ACC = 9.80665; // N por kgf

  /* ---------- Tabla 1: zonificación y velocidad básica ---------- */
  const ZONAS = [
    { id: 'I-A', lat: "17°29'S – 27°22'S", alt: '< 2000', V: 27, p0: 447, des: 'Límite Norte hasta Copiapó' },
    { id: 'I-B', lat: "17°29'S – 27°22'S", alt: '≥ 2000', V: 30, p0: 552, des: 'Límite Norte hasta Copiapó' },
    { id: 'II-A', lat: "27°22'S – 29°54'S", alt: '< 1500', V: 27, p0: 447, des: 'Zona Centro' },
    { id: 'II-B', lat: "27°22'S – 29°54'S", alt: '≥ 1500', V: 35, p0: 751, des: 'Zona Centro' },
    { id: 'III-A', lat: "29°54'S – 37°28'S", alt: '< 1000', V: 34, p0: 709, des: 'Zona Sur' },
    { id: 'III-B', lat: "29°54'S – 37°28'S", alt: '≥ 1000', V: 35, p0: 751, des: 'Zona Sur' },
    { id: 'IV-A', lat: "37°28'S – 41°28'S", alt: '< 600', V: 37, p0: 839, des: 'Zona Sur hasta Chiloé' },
    { id: 'IV-B', lat: "37°28'S – 41°28'S", alt: '≥ 600', V: 40, p0: 981, des: 'Zona Sur hasta Chiloé' },
    { id: 'V', lat: "41°28'S – 50°S", alt: '—', V: 40, p0: 981, des: 'Zona Austral' },
    { id: 'VI', lat: "50°S – 56°32'S", alt: '—', V: 44, p0: 1187, des: 'Zona Austral' },
    { id: 'NC1', lat: '—', alt: '—', V: 32, p0: 628, des: 'Isla de Pascua' },
    { id: 'NC2', lat: '—', alt: '—', V: 50, p0: 1533, des: 'Juan Fernández' },
    { id: 'NC3', lat: '—', alt: '—', V: 60, p0: 2207, des: 'Antártica chilena' },
  ];

  /* ---------- Tabla 2: factor de importancia ---------- */
  const IMPORTANCIA = [
    { cat: 'I', T: 25, I: 0.87 },
    { cat: 'II', T: 50, I: 1.0 },
    { cat: 'III', T: 100, I: 1.15 },
    { cat: 'IV', T: 150, I: 1.22 },
  ];

  /* ---------- Tabla 3: factor de direccionalidad Kd ---------- */
  const KD = [
    { id: 'spr', grupo: 'Edificios', tipo: 'Sistema principal resistente a las fuerzas del viento', Kd: 0.85 },
    { id: 'cyr', grupo: 'Edificios', tipo: 'Componentes y revestimiento', Kd: 0.85 },
    { id: 'arco', grupo: 'Techos en arco', tipo: 'Techos en arco', Kd: 0.85 },
    { id: 'cupula', grupo: 'Cúpulas circulares', tipo: 'Cúpulas circulares', Kd: 1.0 },
    { id: 'ch-cuad', grupo: 'Chimeneas, estanques y similares', tipo: 'Cuadrada', Kd: 0.9 },
    { id: 'ch-hex', grupo: 'Chimeneas, estanques y similares', tipo: 'Hexagonal', Kd: 0.95 },
    { id: 'ch-oct', grupo: 'Chimeneas, estanques y similares', tipo: 'Octagonal', Kd: 1.0 },
    { id: 'ch-red', grupo: 'Chimeneas, estanques y similares', tipo: 'Redonda', Kd: 1.0 },
    { id: 'muro', grupo: 'Muros y letreros', tipo: 'Muros y letreros sólidos, aislados y equipos en techumbres', Kd: 0.85 },
    { id: 'letrero', grupo: 'Muros y letreros', tipo: 'Letreros abiertos y marcos planos', Kd: 0.85 },
    { id: 'cel-rect', grupo: 'Estructuras en celosía', tipo: 'Secciones triangulares, cuadradas o rectangulares', Kd: 0.85 },
    { id: 'cel-otra', grupo: 'Estructuras en celosía', tipo: 'Todas las demás secciones', Kd: 0.95 },
  ];

  /* ---------- 5.5 Exposición ---------- */
  const EXPOSICION = {
    B: {
      rug: 'Áreas urbanas y suburbanas, áreas boscosas u otros terrenos con numerosas obstrucciones muy cercanas entre sí que tienen el tamaño de viviendas unifamiliares o mayor.',
      exp: 'Aplica cuando la rugosidad B prevalece contra el viento en más de 450 m (h ≤ 10 m), o en más de 800 m o 20·h, lo que sea mayor (h > 10 m).',
    },
    C: {
      rug: 'Terreno abierto con obstrucciones dispersas que tienen alturas generalmente inferiores a 10 m. Incluye campos llanos, abiertos y pastizales.',
      exp: 'Aplica a todos los casos en los que la exposición B o D no sea aplicable.',
    },
    D: {
      rug: 'Áreas planas, sin obstáculos o superficies de agua. Incluye marismas lisas, salinas, hielo intacto y planicies desérticas.',
      exp: 'Aplica cuando la rugosidad D prevalece contra el viento en más de 500 m o 20·h; también dentro de 180 m o 20·h de esa condición.',
    },
  };

  /* Tabla 6 – Constantes de exposición al terreno (NCh 432:2025, p. 25) */
  const TERRENO = {
    B: { alpha: 7.5, zg: 1000, zmin: 10 },
    C: { alpha: 9.8, zg: 750, zmin: 5 },
    D: { alpha: 11.5, zg: 590, zmin: 2 },
  };

  /* ---------- Tabla 5: Kz ---------- */
  const TABLA5 = {
    z: [2, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20],
    B: [0.71, 0.71, 0.71, 0.71, 0.71, 0.71, 0.74, 0.77, 0.8, 0.83, 0.85],
    C: [0.87, 0.87, 0.87, 0.9, 0.95, 1.0, 1.04, 1.07, 1.1, 1.13, 1.15],
    D: [0.9, 1.01, 1.05, 1.09, 1.14, 1.19, 1.22, 1.26, 1.29, 1.31, 1.34],
  };

  /* ---------- Tabla 4: Ke ---------- */
  const TABLA4 = { ze: [0, 300, 600, 900, 1200, 1500, 1800], Ke: [1.0, 0.96, 0.93, 0.9, 0.87, 0.84, 0.81] };

  /* ---------- Tabla 7: GCpi ---------- */
  const CERRAMIENTO = {
    cerrado: { nombre: 'Edificio cerrado', presion: 'Moderada', GCpi: 0.18 },
    parcCerrado: { nombre: 'Edificio parcialmente cerrado', presion: 'Alta', GCpi: 0.55 },
    parcAbierto: { nombre: 'Edificio parcialmente abierto', presion: 'Moderada', GCpi: 0.18 },
    abierto: { nombre: 'Edificio abierto', presion: 'Despreciable', GCpi: 0.0 },
  };

  /* ---------- Figura 3: parámetros topográficos ---------- */
  const TOPO = {
    cima2d: { nombre: 'Cima 2D (o valle)', k1: { B: 1.3, C: 1.45, D: 1.55 }, gamma: 3, muUp: 1.5, muDown: 1.5 },
    escarpe2d: { nombre: 'Escarpamiento 2D', k1: { B: 0.75, C: 0.85, D: 0.95 }, gamma: 2.5, muUp: 1.5, muDown: 4 },
    colina3d: { nombre: 'Colina axisimétrica 3D', k1: { B: 0.95, C: 1.05, D: 1.15 }, gamma: 4, muUp: 1.5, muDown: 1.5 },
  };

  /* ================= utilidades ================= */
  function lerp(x, xs, ys) {
    if (x <= xs[0]) return ys[0];
    const n = xs.length - 1;
    if (x >= xs[n]) return ys[n];
    for (let i = 0; i < n; i++) {
      if (x <= xs[i + 1]) {
        const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
        return ys[i] + t * (ys[i + 1] - ys[i]);
      }
    }
    return ys[n];
  }
  const round = (v, d) => { const f = Math.pow(10, d); return Math.round(v * f) / f; };
  const Nm2_to_kgf = (p) => p / G_ACC;

  /* ================= 5.6 / 5.7 / 5.8 ================= */

  /** Kz según Tabla 5 (interpolación) o según fórmula de la Nota 1. */
  function Kz(z, exp, metodo) {
    const t = TERRENO[exp];
    if (metodo === 'tabla' && z <= 20) {
      return lerp(z, TABLA5.z, TABLA5[exp]);
    }
    const zz = Math.min(Math.max(z, t.zmin), t.zg);
    return 2.41 * Math.pow(zz / t.zg, 2 / t.alpha);
  }

  /** Ke: fórmula de la Nota 2 o interpolación en Tabla 4. */
  function Ke(ze, metodo) {
    if (metodo === 'conservador') return 1.0;
    if (metodo === 'tabla' && ze >= 0 && ze <= 1800) return lerp(ze, TABLA4.ze, TABLA4.Ke);
    return Math.exp(-0.000119 * ze);
  }

  /**
   * Kzt según Figura 3. o = { forma, H, Lh, x, z, sentido:'contra'|'favor', exp }
   * Devuelve { Kzt, K1, K2, K3, aplica, motivo }.
   */
  function Kzt(o) {
    const tp = TOPO[o.forma];
    const H = +o.H, Lh0 = +o.Lh;
    if (!tp || !(H > 0) || !(Lh0 > 0)) return { Kzt: 1, K1: 0, K2: 0, K3: 0, aplica: false, motivo: 'Datos topográficos incompletos.' };
    const HLh = H / Lh0;
    const Hmin = o.exp === 'B' ? 18 : 4.5;
    if (HLh < 0.2) return { Kzt: 1, K1: 0, K2: 0, K3: 0, aplica: false, motivo: 'H/Lh = ' + round(HLh, 3) + ' < 0,2 → no aplica (Kzt = 1,0).' };
    if (H < Hmin) return { Kzt: 1, K1: 0, K2: 0, K3: 0, aplica: false, motivo: 'H = ' + H + ' m < ' + Hmin + ' m (exposición ' + o.exp + ') → no aplica (Kzt = 1,0).' };
    let ratio = HLh, Lh = Lh0;
    if (HLh > 0.5) { ratio = 0.5; Lh = 2 * H; }
    const K1 = tp.k1[o.exp] * ratio;
    const mu = o.sentido === 'favor' ? tp.muDown : tp.muUp;
    const K2 = Math.max(0, 1 - Math.abs(+o.x) / (mu * Lh));
    const K3 = Math.exp(-tp.gamma * (+o.z) / Lh);
    return { Kzt: Math.pow(1 + K1 * K2 * K3, 2), K1, K2, K3, aplica: true, motivo: HLh > 0.5 ? 'H/Lh > 0,5: se usa H/Lh = 0,5 para K1 y Lh = 2H para K2 y K3.' : '' };
  }

  /** Presión de velocidad q(z) [N/m²]. */
  function qz(g, z) {
    const kz = Kz(z, g.exp, g.kzMetodo);
    return { Kz: kz, q: 0.613 * g.I * kz * g.Kzt * g.Ke * g.V * g.V };
  }

  /* ================= 5.10 / 5.11 cerramiento ================= */

  /** Clasificación automática del cerramiento a partir de áreas de aberturas. */
  function clasificarCerramiento(o) {
    const Ao = +o.Ao, Ag = +o.Ag, Aoi = +o.Aoi, Agi = +o.Agi;
    if (Ag > 0 && o.abierto80) return 'abierto';
    const lim = Math.min(0.01 * Ag, 0.37);
    const rel = Agi > 0 ? Aoi / Agi : 0;
    if (Ao < lim && rel <= 0.2) return 'cerrado';
    if (Ao > 1.1 * Aoi && Ao > lim && rel <= 0.2) return 'parcCerrado';
    return 'parcAbierto';
  }

  /** Factor de reducción Ri (5.11.1) para edificios parcialmente cerrados de gran volumen. */
  function Ri(Aog, Vi) {
    if (!(Aog > 0) || !(Vi > 0)) return 1;
    const r = 0.5 * (1 + 1 / Math.sqrt(1 + Vi / (6950 * Aog)));
    return Math.min(1, r);
  }

  /* ================= Método direccional – coeficientes Cp ================= */

  /** Cp muro de sotavento según L/B. */
  function CpSotavento(LB) {
    return lerp(LB, [1, 2, 4], [-0.5, -0.3, -0.2]);
  }

  // Techo normal a cumbrera, θ ≥ 10°. null = no aplica.
  const TH = [10, 15, 20, 25, 30, 35, 45, 60];
  const ROOF_WW = {
    0.25: { neg: [-0.7, -0.5, -0.3, -0.2, -0.2, 0.0, 0.0, null], pos: [-0.18, 0.0, 0.2, 0.3, 0.3, 0.4, 0.4, 0.6] },
    0.5: { neg: [-0.9, -0.7, -0.4, -0.3, -0.2, -0.2, 0.0, null], pos: [-0.18, -0.18, 0.0, 0.2, 0.2, 0.3, 0.4, 0.6] },
    1.0: { neg: [-1.3, -1.0, -0.7, -0.5, -0.3, -0.2, 0.0, null], pos: [-0.18, -0.18, -0.18, 0.0, 0.2, 0.2, 0.3, 0.6] },
  };
  const ROOF_LW = { 0.25: [-0.3, -0.5, -0.6], 0.5: [-0.5, -0.5, -0.6], 1.0: [-0.7, -0.6, -0.6] };

  function interpTheta(arr, th) {
    // valores nulos (no aplica) cuando θ > 45°
    if (th > 45 && arr[arr.length - 1] === null) return null;
    if (th >= 60) return null; // se maneja aparte
    return lerp(th, TH.slice(0, arr.length - 1), arr.slice(0, arr.length - 1));
  }
  function posTheta(arr, th) {
    if (th >= 60) return Math.min(0.01 * th, 0.8);
    return lerp(th, TH, arr);
  }
  function interpHL(hL, f) {
    const a = f(0.25), b = f(0.5), c = f(1.0);
    if (a === null || b === null || c === null) return null;
    if (hL <= 0.25) return a;
    if (hL <= 0.5) return a + (b - a) * (hL - 0.25) / 0.25;
    if (hL < 1.0) return b + (c - b) * (hL - 0.5) / 0.5;
    return c;
  }

  /** Cp techo barlovento (θ ≥ 10°, normal a cumbrera). Devuelve { neg, pos } (neg puede ser null). */
  function CpTechoBarlovento(th, hL) {
    // Los valores 0,0ᵃ solo sirven para interpolar: un resultado ≥ 0 en la fila negativa no es un caso de succión.
    let neg = interpHL(hL, (k) => interpTheta(ROOF_WW[k].neg, th));
    if (neg !== null && neg > -1e-9) neg = null;
    return { neg, pos: interpHL(hL, (k) => posTheta(ROOF_WW[k].pos, th)) };
  }

  /**
   * Traza de la interpolación de Cp de techo (θ ≥ 10°): valores de tabla que rodean a θ y h/L.
   * Devuelve { hLs:[k1,k2], ths:[t1,t2], neg:[[..],[..]], pos:[[..],[..]], lee:{ths, v} }.
   */
  function trazaCpTecho(th, hL) {
    const ks = [0.25, 0.5, 1.0];
    const hLs = hL <= 0.25 ? [0.25] : hL >= 1.0 ? [1.0] : hL <= 0.5 ? [0.25, 0.5] : [0.5, 1.0];
    const brk = (xs, x) => {
      if (x <= xs[0]) return [xs[0]];
      if (x >= xs[xs.length - 1]) return [xs[xs.length - 1]];
      for (let i = 0; i < xs.length - 1; i++) if (x <= xs[i + 1]) return x === xs[i + 1] ? [xs[i + 1]] : x === xs[i] ? [xs[i]] : [xs[i], xs[i + 1]];
      return [xs[xs.length - 1]];
    };
    const ths = th >= 60 ? [th] : brk(TH, th);
    const cell = (arr, t) => { const i = TH.indexOf(t); return i < 0 ? (t >= 60 ? Math.min(0.01 * t, 0.8) : null) : arr[i]; };
    const lths = brk([10, 15, 20], th);
    return {
      ks, hLs, ths, lths,
      neg: hLs.map((k) => ths.map((t) => (t > 45 ? null : cell(ROOF_WW[k].neg, t)))),
      pos: hLs.map((k) => ths.map((t) => (t >= 60 ? Math.min(0.01 * t, 0.8) : cell(ROOF_WW[k].pos, t)))),
      lee: hLs.map((k) => lths.map((t) => ROOF_LW[k][[10, 15, 20].indexOf(t)])),
    };
  }
  /** Cp techo sotavento (θ ≥ 10°, normal a cumbrera). */
  function CpTechoSotavento(th, hL) {
    return interpHL(hL, (k) => lerp(th, [10, 15, 20], ROOF_LW[k]));
  }

  /**
   * Cp techo por distancia desde el borde de barlovento (θ < 10° normal a cumbrera,
   * o viento paralelo a la cumbrera). Devuelve el valor negativo; el alternativo es −0,18.
   */
  /** Factor de reducción por área de la nota b (solo para el valor −1,3). */
  function redArea(A) { return lerp(A, [9.3, 23.2, 92.9], [1.0, 0.9, 0.8]); }

  function CpTechoZona(x, h, hL, fb) {
    const low = x <= h / 2 ? -0.9 : x <= h ? -0.9 : x <= 2 * h ? -0.5 : -0.3; // h/L ≤ 0,5
    const high = x <= h / 2 ? -1.3 * (fb || 1) : -0.7; // h/L ≥ 1,0 (nota b: −1,3 reducible por área)
    if (hL <= 0.5) return low;
    if (hL >= 1.0) return high;
    return low + (high - low) * (hL - 0.5) / 0.5;
  }

  /** Zonas del techo (tramos) a lo largo de una distancia total Ltot, en la dirección del viento. */
  function zonasTecho(Ltot, h, hL, fb) {
    const cortes = hL >= 1.0 ? [0, h / 2] : [0, h / 2, h, 2 * h];
    const tramos = [];
    for (let i = 0; i < cortes.length; i++) {
      const x0 = cortes[i];
      const x1 = i + 1 < cortes.length ? cortes[i + 1] : Infinity;
      if (x0 >= Ltot) break;
      const xe = Math.min(x1, Ltot);
      tramos.push({ x0, x1: xe, Cp: CpTechoZona((x0 + xe) / 2, h, hL, fb) });
    }
    return tramos;
  }
  /** Promedio de Cp (zonas) entre a y b medido desde el borde de barlovento. */
  function CpZonaPromedio(a, b, h, hL, Ltot) {
    const tr = zonasTecho(Ltot, h, hL);
    let s = 0;
    for (const t of tr) {
      const lo = Math.max(a, t.x0), hi = Math.min(b, t.x1);
      if (hi > lo) s += t.Cp * (hi - lo);
    }
    return b > a ? s / (b - a) : 0;
  }

  /**
   * Método direccional para edificio rectangular (galpón).
   * geo = { largo, ancho, hAlero, tipoTecho:'dos'|'una'|'plana', theta }
   *   largo: dimensión paralela a la cumbrera; ancho: luz (perpendicular a la cumbrera).
   * g = parámetros generales resueltos { V, I, Kd, Kzt, Ke, exp, kzMetodo, G, GCpi }
   */
  function direccional(g, geo) {
    const th = geo.tipoTecho === 'plana' ? 0 : +geo.theta;
    const rad = th * Math.PI / 180;
    const rise = geo.tipoTecho === 'dos' ? (geo.ancho / 2) * Math.tan(rad) : geo.tipoTecho === 'una' ? geo.ancho * Math.tan(rad) : 0;
    const hCum = geo.hAlero + rise;
    const h = th <= 10 ? geo.hAlero : geo.hAlero + rise / 2;
    const qH = qz(g, h);
    const qh = qH.q;
    const Kd = g.Kd, G = g.G, GCpi = g.GCpi;
    const p = (q, Cp) => ({
      pos: q * Kd * G * Cp - qh * Kd * GCpi, // con +GCpi
      neg: q * Kd * G * Cp + qh * Kd * GCpi, // con −GCpi
    });

    const dirs = [];
    // ---- Dirección normal a la cumbrera ----
    {
      const B = geo.largo, L = geo.ancho, hL = h / L, LB = L / B;
      const filas = [];
      const CpLee = CpSotavento(LB);
      filas.push({ sup: 'Muro barlovento', ref: 'q(h)', Cp: 0.8, q: qh, ...p(qh, 0.8), nota: 'Con qz; ver perfil en altura' });
      filas.push({ sup: 'Muro sotavento', ref: 'qh', Cp: CpLee, q: qh, ...p(qh, CpLee) });
      filas.push({ sup: 'Muros laterales', ref: 'qh', Cp: -0.7, q: qh, ...p(qh, -0.7) });
      if (th >= 10 && geo.tipoTecho !== 'plana') {
        const ww = CpTechoBarlovento(th, hL);
        const lw = CpTechoSotavento(th, hL);
        const nomW = geo.tipoTecho === 'una' ? 'Techo (viento desde el lado bajo)' : 'Techo barlovento';
        const nomL = geo.tipoTecho === 'una' ? 'Techo (viento desde el lado alto)' : 'Techo sotavento';
        if (ww.neg !== null) filas.push({ sup: nomW, sub: 'caso succión', Cp: ww.neg, q: qh, ...p(qh, ww.neg) });
        filas.push({ sup: nomW, sub: ww.neg !== null ? 'caso presión' : '', Cp: ww.pos, q: qh, ...p(qh, ww.pos) });
        filas.push({ sup: nomL, Cp: lw, q: qh, ...p(qh, lw) });
      } else {
        for (const t of zonasTecho(L, h, hL)) {
          filas.push({ sup: 'Techo ' + fmtTramo(t, L), Cp: t.Cp, q: qh, ...p(qh, t.Cp) });
        }
        filas.push({ sup: 'Techo (todas las zonas)', sub: 'caso alternativo', Cp: -0.18, q: qh, ...p(qh, -0.18) });
      }
      dirs.push({ id: 'normal', nombre: 'Viento normal a la cumbrera', B, L, hL, LB, filas });
    }
    // ---- Dirección paralela a la cumbrera ----
    {
      const B = geo.ancho, L = geo.largo, hL = h / L, LB = L / B;
      const filas = [];
      const CpLee = CpSotavento(LB);
      filas.push({ sup: 'Muro barlovento (frontón)', Cp: 0.8, q: qh, ...p(qh, 0.8), nota: 'Con qz; ver perfil en altura' });
      filas.push({ sup: 'Muro sotavento (frontón)', Cp: CpLee, q: qh, ...p(qh, CpLee) });
      filas.push({ sup: 'Muros laterales', Cp: -0.7, q: qh, ...p(qh, -0.7) });
      for (const t of zonasTecho(L, h, hL)) {
        filas.push({ sup: 'Techo ' + fmtTramo(t, L), Cp: t.Cp, q: qh, ...p(qh, t.Cp) });
      }
      filas.push({ sup: 'Techo (todas las zonas)', sub: 'caso alternativo', Cp: -0.18, q: qh, ...p(qh, -0.18) });
      dirs.push({ id: 'paralelo', nombre: 'Viento paralelo a la cumbrera', B, L, hL, LB, filas });
    }

    // Perfil de presión en muro de barlovento
    const perfil = [];
    const niveles = new Set([0]);
    const paso = hCum <= 12 ? 1 : hCum <= 30 ? 2 : 5;
    for (let z = paso; z < hCum; z += paso) niveles.add(round(z, 2));
    niveles.add(round(geo.hAlero, 2));
    niveles.add(round(h, 2));
    niveles.add(round(hCum, 2));
    const lv = [...niveles].sort((a, b) => a - b).filter((z, i, a) => i === 0 || z - a[i - 1] > 0.05 || z === round(hCum, 2));
  for (const z of lv) {
      const r = qz(g, z);
      perfil.push({ z, Kz: r.Kz, q: r.q, ...p(r.q, 0.8) });
    }
    return { theta: th, h, hCum, rise, Kh: qH.Kz, qh, dirs, perfil };
  }

  function fmtTramo(t, L) {
    const f = (v) => (Math.round(v * 100) / 100).toLocaleString('es-CL');
    return '[' + f(t.x0) + ' – ' + f(Math.min(t.x1, L)) + ' m]';
  }

  /* ================= Galpón: casos ±WX ±WY para SAP 2000 ================= */
  /**
   * Ejes: X perpendicular a la cumbrera (a lo largo de la luz), Y paralelo a la cumbrera.
   * Superficies: muro X− (x = 0), muro X+ (x = luz), frontón Y− (y = 0), frontón Y+ (y = largo),
   * faldón X− / X+ (dos aguas) o techo único que sube hacia X+ (una agua).
   * +WX: viento en sentido +x (golpea el muro X−). +WY: viento en sentido +y (golpea el frontón Y−).
   * Cada dirección se combina con las variantes de Cp de techo y con ±GCpi.
   * p = qh·Kd·G·Cp − qh·Kd·(GCpi)  (se usa qh también en el muro de barlovento, conservador).
   * geo = { largo, ancho, hAlero, tipoTecho, theta, sepMarcos, redArea }
   */
  function galponSAP(g, geo) {
    const tipo = geo.tipoTecho;
    const th = tipo === 'plana' ? 0 : +geo.theta;
    const rad = th * Math.PI / 180;
    const S = geo.ancho, Lg = geo.largo;
    const rise = tipo === 'dos' ? (S / 2) * Math.tan(rad) : tipo === 'una' ? S * Math.tan(rad) : 0;
    const h = th <= 10 ? geo.hAlero : geo.hAlero + rise / 2;
    const qH = qz(g, h), qh = qH.q;
    const k = qh * g.Kd;
    const pe = (Cp) => k * g.G * Cp;
    const slopeRoof = th >= 10 && tipo !== 'plana';
    const fbX = geo.redArea ? redArea((h / 2) * Lg) : 1; // franja 0–h/2 con viento X
    const fbY = geo.redArea ? redArea((h / 2) * S) : 1;

    // Coeficientes externos por dirección
    const hLx = h / S, hLy = h / Lg;
    const CpLeeX = CpSotavento(S / Lg), CpLeeY = CpSotavento(Lg / S);
    const ww = slopeRoof ? CpTechoBarlovento(th, hLx) : null;
    const lw = slopeRoof ? CpTechoSotavento(th, hLx) : null;
    const zonasX = zonasTecho(S, h, hLx, fbX);
    const zonasY = zonasTecho(Lg, h, hLy, fbY);

    // Variantes de Cp de techo
    const varX = [];
    if (slopeRoof) {
      if (ww.neg !== null) varX.push({ id: 'S', nombre: 'barlovento en succión', cpW: ww.neg, cpL: lw });
      varX.push({ id: 'P', nombre: ww.neg !== null ? 'barlovento en presión' : 'barlovento', cpW: ww.pos, cpL: lw });
    } else {
      varX.push({ id: 'Z', nombre: 'zonas por distancia', zonas: true });
      varX.push({ id: 'A', nombre: 'alternativo −0,18', alt: -0.18 });
    }
    const varY = [{ id: 'Z', nombre: 'zonas por distancia', zonas: true }, { id: 'A', nombre: 'alternativo −0,18', alt: -0.18 }];

    const hX0 = geo.hAlero, hX1 = geo.hAlero + (tipo === 'una' ? rise : 0);
    const Awall = { 'Muro X−': Lg * hX0, 'Muro X+': Lg * hX1 };
    const Agable = S * geo.hAlero + S * rise / 2;
    const cos = Math.cos(rad), sin = Math.sin(rad);

    // Tramos de techo en coordenadas de planta para cada patrón
    function techoTramos(dir, sentido, v) {
      // devuelve lista { sup, faldon:'X−'|'X+'|'U', eje:'x'|'y', a, b, Cp }
      const out = [];
      const halves = tipo === 'dos' ? [['X−', 0, S / 2], ['X+', S / 2, S]] : tipo === 'una' ? [['U', 0, S]] : [['X−', 0, S / 2], ['X+', S / 2, S]];
      if (dir === 'X') {
        if (v.alt !== undefined) { for (const [f, a, b] of halves) out.push({ faldon: f, eje: 'x', a, b, Cp: v.alt }); return out; }
        if (!v.zonas) {
          if (tipo === 'una') out.push({ faldon: 'U', eje: 'x', a: 0, b: S, Cp: sentido > 0 ? v.cpW : v.cpL });
          else {
            out.push({ faldon: 'X−', eje: 'x', a: 0, b: S / 2, Cp: sentido > 0 ? v.cpW : v.cpL });
            out.push({ faldon: 'X+', eje: 'x', a: S / 2, b: S, Cp: sentido > 0 ? v.cpL : v.cpW });
          }
          return out;
        }
        // zonas medidas desde el borde de barlovento
        for (const z of zonasX) {
          const a = sentido > 0 ? z.x0 : S - z.x1, b = sentido > 0 ? z.x1 : S - z.x0;
          for (const [f, fa, fb] of halves) {
            const lo = Math.max(a, fa), hi = Math.min(b, fb);
            if (hi - lo > 1e-9) out.push({ faldon: f, eje: 'x', a: lo, b: hi, Cp: z.Cp });
          }
        }
        return out.sort((p, q) => p.a - q.a);
      }
      // dir Y: mismas zonas en ambos faldones, medidas a lo largo de y
      if (v.alt !== undefined) return [{ faldon: 'todo', eje: 'y', a: 0, b: Lg, Cp: v.alt }];
      return zonasY.map((z) => ({ faldon: 'todo', eje: 'y', a: sentido > 0 ? z.x0 : Lg - z.x1, b: sentido > 0 ? z.x1 : Lg - z.x0, Cp: z.Cp }))
        .sort((p, q) => p.a - q.a);
    }

    const casos = [];
    let n = 0;
    for (const dir of ['X', 'Y']) {
      for (const sentido of [1, -1]) {
        const vars = dir === 'X' ? varX : varY;
        vars.forEach((v, iv) => {
          for (const sg of g.GCpi > 0 ? [1, -1] : [0]) {
            n++;
            const gcpi = sg * g.GCpi;
            const pi = k * gcpi;
            const muros = [];
            if (dir === 'X') {
              muros.push({ sup: 'Muro X−', Cp: sentido > 0 ? 0.8 : CpLeeX, rol: sentido > 0 ? 'barlovento' : 'sotavento' });
              muros.push({ sup: 'Muro X+', Cp: sentido > 0 ? CpLeeX : 0.8, rol: sentido > 0 ? 'sotavento' : 'barlovento' });
              muros.push({ sup: 'Frontón Y−', Cp: -0.7, rol: 'lateral' });
              muros.push({ sup: 'Frontón Y+', Cp: -0.7, rol: 'lateral' });
            } else {
              muros.push({ sup: 'Muro X−', Cp: -0.7, rol: 'lateral' });
              muros.push({ sup: 'Muro X+', Cp: -0.7, rol: 'lateral' });
              muros.push({ sup: 'Frontón Y−', Cp: sentido > 0 ? 0.8 : CpLeeY, rol: sentido > 0 ? 'barlovento' : 'sotavento' });
              muros.push({ sup: 'Frontón Y+', Cp: sentido > 0 ? CpLeeY : 0.8, rol: sentido > 0 ? 'sotavento' : 'barlovento' });
            }
            for (const m of muros) { m.pext = pe(m.Cp); m.p = m.pext - pi; }
            const techo = techoTramos(dir, sentido, v).map((t) => Object.assign(t, { pext: pe(t.Cp), p: pe(t.Cp) - pi }));

            const signo = sentido > 0 ? '+' : '−';
            casos.push({
              n, dir, sentido, variante: v, iv, gcpi,
              nombre: signo + 'W' + dir,
              sap: 'W' + dir + (sentido > 0 ? 'P' : 'N') + '_' + (iv * (g.GCpi > 0 ? 2 : 1) + (sg >= 0 ? 1 : 2)),
              desc: signo + 'W' + dir + ' · techo ' + v.nombre + ' · GCpi ' + (gcpi > 0 ? '+' : gcpi < 0 ? '−' : '') + Math.abs(gcpi).toFixed(2),
              muros, techo,
            });
          }
        });
      }
    }

    const post = procesarCasos(casos, { tipo, rad, S, Lg, hAlero: geo.hAlero, rise, Awall, Agable, sepMarcos: +geo.sepMarcos, ejesY: geo.ejesY, ejesX: geo.ejesX });
    return Object.assign({
      metodo: 'cap6', theta: th, h, rise, Kh: qH.Kz, qh, hLx, hLy, CpLeeX, CpLeeY, ww, lw, zonasX, zonasY, fbX, fbY,
      traza: slopeRoof ? trazaCpTecho(th, hLx) : null, slopeRoof, Awall, Agable, casos,
    }, post);
  }

  /**
   * Post-proceso común (cap. 6 y Anexo A): resultantes, envolvente, casos que gobiernan,
   * torsión de la Fig. 11, cargas mínimas (6.1.5) y cargas por marco.
   * Cada caso trae muros[] {sup, Cp, p, pext} y techo[] {faldon, eje, a, b, Cp, p, pext}.
   */
  function procesarCasos(casos, ctx) {
    const { tipo, rad, S, Lg, Awall, Agable } = ctx;
    const tn = Math.tan(rad);
    for (const c of casos) {
      let Fx = 0, Fy = 0, Fz = 0;
      for (const m of c.muros) {
        if (m.sup === 'Muro X−') Fx += m.pext * Awall['Muro X−'];
        if (m.sup === 'Muro X+') Fx -= m.pext * Awall['Muro X+'];
        if (m.sup === 'Frontón Y−') Fy += m.pext * Agable;
        if (m.sup === 'Frontón Y+') Fy -= m.pext * Agable;
      }
      for (const t of c.techo) {
        const Aplan = (t.b - t.a) * (t.eje === 'x' ? Lg : (t.faldon === 'todo' ? S : S / 2));
        Fz -= t.pext * Aplan; // + hacia arriba
        if (tipo === 'plana') continue;
        if (t.eje === 'x' || tipo === 'una') Fx += (t.faldon === 'X+' ? -1 : 1) * t.pext * Aplan * tn;
        // eje y en dos aguas: faldones X− y X+ con la misma presión, sus componentes horizontales se anulan
      }
      c.Fx = Fx; c.Fy = Fy; c.Fz = Fz;
    }

    // Envolvente por superficie
    const env = {};
    const upd = (sup, p, c) => {
      const e = env[sup] || (env[sup] = { sup, max: -Infinity, min: Infinity, cmax: null, cmin: null });
      if (p > e.max) { e.max = p; e.cmax = c.sap; }
      if (p < e.min) { e.min = p; e.cmin = c.sap; }
    };
    for (const c of casos) {
      for (const m of c.muros) upd(m.sup, m.p, c);
      for (const t of c.techo) {
        if (tipo === 'una') upd('Techo', t.p, c);
        else if (t.faldon === 'todo') { upd('Faldón X−', t.p, c); upd('Faldón X+', t.p, c); }
        else upd('Faldón ' + t.faldon, t.p, c);
      }
    }
    const gov = (fn) => casos.reduce((b, c) => (fn(c) > fn(b) ? c : b), casos[0]);
    const gobiernan = {
      FxMax: gov((c) => c.Fx), FxMin: gov((c) => -c.Fx), FyMax: gov((c) => c.Fy), FyMin: gov((c) => -c.Fy),
      FzMax: gov((c) => c.Fz), FzMin: gov((c) => -c.Fz),
    };

    // Fig. 11, caso 2: Mz = 0,75 (pW + pL) B e, e = ±0,15 B (por unidad de altura), y total sobre la altura del muro
    const torsion = ['X', 'Y'].map((dir) => {
      const cs = casos.filter((c) => c.dir === dir && c.sentido > 0);
      if (!cs.length) return null;
      const c = cs[0];
      const w = c.muros.find((m) => m.rol === 'barlovento'), l = c.muros.find((m) => m.rol === 'sotavento');
      const B = dir === 'X' ? Lg : S;
      const hW = dir === 'X' ? ctx.hAlero : ctx.hAlero + ctx.rise / 2; // altura media del muro expuesto
      const suma = Math.abs(w.pext) + Math.abs(l.pext);
      const e = 0.15 * B;
      return { dir, B, e, pW: w.pext, pL: l.pext, hW, MzUnit: 0.75 * suma * B * e, Mz: 0.75 * suma * B * e * hW, Mz4: 0.563 * suma * B * e * hW };
    }).filter(Boolean);

    // 6.1.5 Cargas mínimas: 0,25 kN/m² en muros y 0,13 kN/m² en la proyección vertical del techo
    const riseT = ctx.rise;
    const minimo = {
      X: 250 * Lg * ctx.hAlero + 130 * Lg * riseT,
      Y: 250 * S * ctx.hAlero + 130 * S * riseT / 2,
    };
    const maxFx = Math.max(...casos.map((c) => Math.abs(c.Fx))), maxFy = Math.max(...casos.map((c) => Math.abs(c.Fy)));
    minimo.cumpleX = maxFx >= minimo.X; minimo.cumpleY = maxFy >= minimo.Y; minimo.maxFx = maxFx; minimo.maxFy = maxFy;

    // Cargas en marcos transversales (plano XZ): ejes numerados a lo largo de Y (posiciones libres)
    const marcos = [];
    let posY = Array.isArray(ctx.ejesY) && ctx.ejesY.length >= 2 ? ctx.ejesY.slice() : null;
    if (!posY && +ctx.sepMarcos > 0) {
      const nEsp = Math.max(1, Math.round(Lg / ctx.sepMarcos));
      posY = []; for (let i = 0; i <= nEsp; i++) posY.push(Math.min(i * ctx.sepMarcos, Lg));
    }
    if (posY) posY.forEach((y, i) => {
      const a = i === 0 ? 0 : (posY[i - 1] + y) / 2, b = i === posY.length - 1 ? Lg : (y + posY[i + 1]) / 2;
      marcos.push({ i: i + 1, eje: String(i + 1), y, a, b, trib: b - a });
    });
    // Pilares de frontón: ejes con letra a lo largo de X
    const pilares = [];
    const posX = Array.isArray(ctx.ejesX) && ctx.ejesX.length >= 2 ? ctx.ejesX : [0, S];
    posX.forEach((x, i) => {
      const a = i === 0 ? 0 : (posX[i - 1] + x) / 2, b = i === posX.length - 1 ? S : (x + posX[i + 1]) / 2;
      pilares.push({ i: i + 1, eje: letraEje(i), x, a, b, trib: b - a });
    });
    function cargaMarco(c, mc) {
      const wm = (sup) => c.muros.find((m) => m.sup === sup).p * mc.trib;
      const res = { colXm: wm('Muro X−'), colXp: wm('Muro X+'), vigas: [] };
      const halvesM = tipo === 'una' ? [['U', 0, S]] : [['X−', 0, S / 2], ['X+', S / 2, S]];
      if (c.techo.every((t) => t.eje === 'x')) {
        for (const t of c.techo) res.vigas.push({ faldon: t.faldon, a: t.a, b: t.b, w: t.p * mc.trib });
      } else {
        // presión variable a lo largo de y: se integra sobre la franja tributaria del marco, por faldón
        for (const [f, a, b] of halvesM) {
          let s = 0;
          for (const t of c.techo) {
            if (!(t.faldon === 'todo' || t.faldon === f || (f === 'U'))) continue;
            const lo = Math.max(t.a, mc.a), hi = Math.min(t.b, mc.b);
            if (hi > lo) s += t.p * (hi - lo);
          }
          res.vigas.push({ faldon: f, a, b, w: s });
        }
      }
      return res;
    }
    return { env: Object.values(env), gobiernan, torsion, minimo, marcos, pilares, cargaMarco };
  }

  /** Letra de eje longitudinal: A, B, …, Z, AA, AB… */
  function letraEje(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

  /**
   * Lee separaciones de ejes: "5, 3*6, 5" o "5 3x6 5" → [5,6,6,6,5]. Devuelve { sep, pos, total, error }.
   */
  function parseEjes(txt) {
    const sep = [];
    const tokens = String(txt || '').replace(/;/g, ',').split(/[,\s]+/).filter(Boolean);
    for (const t of tokens) {
      const m = t.replace(',', '.').match(/^(\d+)\s*[*xX]\s*([\d.]+)$/);
      if (m) { for (let k = 0; k < +m[1]; k++) sep.push(+m[2]); continue; }
      const v = parseFloat(t.replace(',', '.'));
      if (!(v > 0)) return { sep: [], pos: [], total: 0, error: 'No se entiende "' + t + '"' };
      sep.push(v);
    }
    const pos = [0]; for (const d of sep) pos.push(round(pos[pos.length - 1] + d, 6));
    return { sep, pos, total: pos[pos.length - 1], error: sep.length ? '' : 'Ingrese al menos una separación' };
  }

  // techo envolvente entre varios conjuntos de vigas
  function envTecho(sets, modo, f) {
    const halves = {};
    for (const vs of sets) for (const v of vs) (halves[v.faldon] = halves[v.faldon] || []).push(v);
    const res = [];
    for (const fal of Object.keys(halves)) {
      const segs = halves[fal];
      const cuts = [...new Set(segs.flatMap((v) => [v.a, v.b]).map((x) => round(x, 6)))].sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i++) {
        const m = (cuts[i] + cuts[i + 1]) / 2;
        const vals = sets.map((vs) => { const v = vs.find((t) => t.faldon === fal && m >= t.a - 1e-9 && m <= t.b + 1e-9); return v ? v.w : 0; });
        const w = (modo === 'S' ? Math.min(...vals) : Math.max(...vals)) * f;
        const last = res[res.length - 1];
        if (last && last.faldon === fal && Math.abs(last.w - w) < 1e-9 && Math.abs(last.b - cuts[i]) < 1e-9) last.b = cuts[i + 1];
        else res.push({ faldon: fal, a: cuts[i], b: cuts[i + 1], w });
      }
    }
    return res;
  }

  /**
   * Cargas por marco para los 4 casos de diseño de la Fig. 11 (6.3.5).
   * Criterio: los factores se aplican a la presión de diseño p de cada patrón (Ec. 4, incluye GCpi).
   *  Caso 1: cada patrón al 100 %.
   *  Caso 2: muros 0,75·p con torsión; en un marco transversal la excentricidad e = ±0,15B se representa con el
   *          bloque de presión equivalente (nota 4): f(y) = 1 ± 1,8 (y/L − 0,5) en los muros X. Techo 0,75·p (caso 1).
   *  Caso 3: 0,75·muros WX + 0,75·muros WY simultáneos; techo = 100 % del mayor valor del caso 1 (nota 2).
   *  Caso 4: 0,563·muros WX (con torsión) + 0,563·muros WY; techo = 100 % del mayor valor del caso 2 (0,75 del caso 1).
   * El "mayor valor" del techo se evalúa en dos variantes: máxima succión (mín. algebraico) y máxima presión.
   */
  function casosMarco(r, mc, Lg) {
    const L = (c) => r.cargaMarco(c, mc);
    const xs = r.casos.filter((c) => c.dir === 'X'), ys = r.casos.filter((c) => c.dir === 'Y');
    const out = { c1: [], c2: [], c3: [], c4: [] };
    const scaleV = (v, f) => v.map((t) => ({ faldon: t.faldon, a: t.a, b: t.b, w: t.w * f }));
    const fy = (es) => 1 + es * 1.8 * (mc.y / Lg - 0.5);
    for (const c of r.casos) { const l = L(c); out.c1.push({ nombre: 'C1·' + c.sap, desc: c.desc, colXm: l.colXm, colXp: l.colXp, vigas: l.vigas }); }
    for (const c of xs) for (const es of [1, -1]) {
      const l = L(c), f = 0.75 * fy(es);
      out.c2.push({ nombre: 'C2·' + c.sap + '·e' + (es > 0 ? '+' : '−'), desc: '0,75 · ' + c.desc + ', excentricidad ' + (es > 0 ? '+' : '−') + '0,15B (f = ' + fy(es).toFixed(2) + ')',
        colXm: l.colXm * f, colXp: l.colXp * f, vigas: scaleV(l.vigas, 0.75) });
    }
    for (const c of ys) { const l = L(c); out.c2.push({ nombre: 'C2·' + c.sap, desc: '0,75 · ' + c.desc, colXm: 0.75 * l.colXm, colXp: 0.75 * l.colXp, vigas: scaleV(l.vigas, 0.75) }); }
    const signos = r.casos.some((c) => c.gcpi !== 0) ? [1, -1] : [0];
    for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sg of signos) {
      const cx = xs.filter((c) => c.sentido === sx && Math.sign(c.gcpi) === sg);
      const cy = ys.filter((c) => c.sentido === sy && Math.sign(c.gcpi) === sg);
      if (!cx.length || !cy.length) continue;
      const lx = L(cx[0]), ly = L(cy[0]);
      const techos = [...cx, ...cy].map((c) => L(c).vigas);
      const tag = (sx > 0 ? '+X' : '−X') + (sy > 0 ? '+Y' : '−Y') + (sg > 0 ? '·Pi+' : sg < 0 ? '·Pi−' : '');
      for (const modo of ['S', 'P']) {
        out.c3.push({ nombre: 'C3·' + tag + '·T' + modo, desc: '0,75·muros ' + (sx > 0 ? '+' : '−') + 'WX + 0,75·muros ' + (sy > 0 ? '+' : '−') + 'WY; techo 100 % máx. ' + (modo === 'S' ? 'succión' : 'presión') + ' del caso 1',
          colXm: 0.75 * (lx.colXm + ly.colXm), colXp: 0.75 * (lx.colXp + ly.colXp), vigas: envTecho(techos, modo, 1) });
        for (const es of [1, -1]) {
          const f = 0.563 * fy(es);
          out.c4.push({ nombre: 'C4·' + tag + '·T' + modo + '·e' + (es > 0 ? '+' : '−'), desc: '0,563·muros ' + (sx > 0 ? '+' : '−') + 'WX (f = ' + fy(es).toFixed(2) + ') + 0,563·muros ' + (sy > 0 ? '+' : '−') + 'WY; techo 100 % máx. ' + (modo === 'S' ? 'succión' : 'presión') + ' del caso 2',
            colXm: f * lx.colXm + 0.563 * ly.colXm, colXp: f * lx.colXp + 0.563 * ly.colXp, vigas: envTecho(techos, modo, 0.75) });
        }
      }
    }
    // Envolvente por elemento para cada caso
    const envol = {};
    for (const k of Object.keys(out)) {
      const e = {};
      const upd = (key, v, n) => { const o = e[key] || (e[key] = { max: -Infinity, min: Infinity, nmax: '', nmin: '' }); if (v > o.max) { o.max = v; o.nmax = n; } if (v < o.min) { o.min = v; o.nmin = n; } };
      for (const it of out[k]) {
        upd('colXm', it.colXm, it.nombre); upd('colXp', it.colXp, it.nombre);
        for (const v of it.vigas) upd('viga' + v.faldon, v.w, it.nombre);
      }
      envol[k] = e;
    }
    return Object.assign(out, { envol });
  }

  /**
   * Componentes y revestimientos en muros (cap. 9, Parte 1, Fig. 24; h ≤ 18,3 m).
   * GCp según área efectiva A (interpolación en log A): zonas 4 y 5; reducción 10 % si θ ≤ 10° (nota 5).
   * p = qh·Kd·[(GCp) − (GCpi)] (Ec. 19); mínimo neto 0,25 kN/m² (9.2.2).
   * el = { H: altura del elemento (luz), s: separación/ancho tributario }
   */
  function GCpMuro(zona, A, th) {
    const la = Math.log10(Math.min(Math.max(A, 0.9), 46.5));
    const t = (la - Math.log10(0.9)) / (Math.log10(46.5) - Math.log10(0.9));
    const pos = 1.0 + t * (0.7 - 1.0);
    const neg = zona === 5 ? -1.4 + t * (-0.8 + 1.4) : -1.1 + t * (-0.8 + 1.1);
    const red = th <= 10 ? 0.9 : 1;
    return { pos: pos * red, neg: neg * red, red };
  }
  /**
   * Selección de los casos de análisis (lo que se modela en SAP):
   *  1) Simetría: con techo a dos aguas o plano, −WX es espejo de +WX; si los vanos en Y son simétricos, −WY es espejo de +WY.
   *     Se conserva sólo el sentido positivo de la dirección simétrica.
   *  2) Dominancia: de los patrones restantes se conservan los que gobiernan al menos un efecto: presión o succión
   *     máxima de una superficie, corte Fx/Fy, levantamiento Fz (máx. y mín.), o un esfuerzo extremo de columna o viga
   *     en algún marco (caso 1).
   *  Para los casos 2 a 4 de la Fig. 11 se reportan, por marco, sólo las combinaciones que gobiernan algún elemento.
   */
  function analisisGalpon(r, geo, opt) {
    const diaf = !!(opt && opt.diafragma); // casos 2 a 4 de la Fig. 11 sólo con diafragma / 2 o más niveles
    const tol = 1e-6;
    const simX = geo.tipoTecho !== 'una';
    const pos = geo.ejesY || [0, geo.largo];
    const sep = pos.slice(1).map((y, i) => y - pos[i]);
    const simY = sep.every((d, i) => Math.abs(d - sep[sep.length - 1 - i]) < tol);
    const cand = r.casos.filter((c) => !((c.dir === 'X' && simX) || (c.dir === 'Y' && simY)) || c.sentido > 0);
    // Efectos a cubrir: cada uno con su valor por patrón (mayor = más desfavorable)
    const efectos = [];
    // Con simetría, un efecto en X+ equivale al de X− (e Y+ a Y−): se fusionan tomando el mayor por patrón
    const norm = (t) => { let x = t; if (simX) x = x.replace(/X\+/g, 'X−'); if (simY) x = x.replace(/Y\+/g, 'Y−'); return x; };
    const pushEf = (txt, v) => {
      const t = norm(txt), e = efectos.find((q) => q.txt === t);
      if (e) { e.v = e.v.map((x, i) => Math.max(x, v[i])); e.mx = Math.max(...e.v); }
      else { const mx = Math.max(...v); if (mx > tol) efectos.push({ txt: t, v: v.slice(), mx }); }
    };
    const ef = (txt, fn) => pushEf(txt, cand.map(fn));
    const sups = [...new Set(cand.flatMap((c) => [...c.muros.map((m) => m.sup), ...c.techo.map((t) => (t.faldon === 'U' || t.faldon === 'todo') ? 'Techo' : 'Faldón ' + t.faldon)]))];
    const pSup = (c, sup, modo) => {
      const vals = /^(Muro|Frontón)/.test(sup) ? c.muros.filter((m) => m.sup === sup).map((m) => m.p)
        : c.techo.filter((t) => t.faldon === 'todo' || t.faldon === 'U' || 'Faldón ' + t.faldon === sup).map((t) => t.p);
      return vals.length ? (modo > 0 ? Math.max(...vals) : Math.min(...vals)) : 0;
    };
    for (const sup of sups) { ef('máx. presión ' + sup, (c) => pSup(c, sup, 1)); ef('máx. succión ' + sup, (c) => -pSup(c, sup, -1)); }
    ef('máx. corte Fx', (c) => Math.abs(c.Fx)); ef('máx. corte Fy', (c) => Math.abs(c.Fy));
    ef('máx. levantamiento', (c) => c.Fz); ef('carga de techo hacia abajo', (c) => -c.Fz);
    const marcosRes = r.marcos.map((mc) => {
      const cm = casosMarco(r, mc, geo.largo);
      return { mc, cm };
    });
    const idx = new Map(cand.map((c, i) => [c.sap, i]));
    const elemVals = (it) => {
      const o = { 'columna X−': it.colXm, 'columna X+': it.colXp };
      for (const v of it.vigas) { const k = 'viga ' + (v.faldon === 'U' ? 'techo' : v.faldon); o[k + '|+'] = Math.max(o[k + '|+'] ?? -Infinity, v.w); o[k + '|-'] = Math.min(o[k + '|-'] ?? Infinity, v.w); }
      return o;
    };
    const efM = {};
    for (const m of marcosRes) for (const it of m.cm.c1) {
      const i = idx.get(it.nombre.slice(3)); if (i === undefined) continue;
      const o = elemVals(it);
      for (const [k, val] of Object.entries(o)) {
        const base = k.replace(/\|[+-]$/, '');
        const pares = k.endsWith('|+') ? [['máx. + ' + base, val]] : k.endsWith('|-') ? [['máx. − ' + base, -val]] : [['máx. + ' + k, val], ['máx. − ' + k, -val]];
        for (const [t, x] of pares) { const e = efM[t] || (efM[t] = cand.map(() => -Infinity)); e[i] = Math.max(e[i], x); }
      }
    }
    for (const [t, v] of Object.entries(efM)) pushEf('marcos: ' + t, v);
    for (let k = efectos.length - 1; k >= 0; k--) if (!(efectos[k].mx > tol)) efectos.splice(k, 1);
    // Cobertura mínima (voraz): un patrón cubre un efecto si llega al 97 % del máximo
    const cubre = efectos.map((e) => e.v.map((x) => x >= 0.97 * e.mx - tol));
    const pendientes = new Set(efectos.map((_, k) => k));
    const elegidos = [];
    while (pendientes.size) {
      let best = -1, nb = -1;
      cand.forEach((c, i) => { if (elegidos.includes(i)) return; let n = 0; for (const k of pendientes) if (cubre[k][i]) n++; if (n > nb) { nb = n; best = i; } });
      if (nb <= 0) break;
      elegidos.push(best);
      for (const k of [...pendientes]) if (cubre[k][best]) pendientes.delete(k);
    }
    // Estados de análisis (criterio práctico): por dirección y sentido no espejo, un estado con +GCpi y otro con −GCpi;
    // la variante de techo es la más desfavorable para ese signo (+GCpi: máximo levantamiento; −GCpi: mínimo levantamiento).
    // En el Anexo A (sin GCpi) se conservan las variantes de techo, sin repetir espejos.
    const estados = [];
    for (const dir of ['X', 'Y']) for (const sen of [1, -1]) {
      const cs = cand.filter((c) => c.dir === dir && c.sentido === sen);
      if (!cs.length) continue;
      if (cs.every((c) => c.gcpi === 0)) {
        const vistos = [];
        for (const c of cs) {
          const key = c.techo.map((t) => t.Cp.toFixed(3)).sort().join(',') + '|' + c.muros.map((m) => m.Cp.toFixed(3)).join(',');
          if (dir === 'Y' && simX && vistos.includes(key)) continue;
          vistos.push(key); estados.push(c);
        }
      } else for (const sg of [1, -1]) {
        const gg = cs.filter((c) => Math.sign(c.gcpi) === sg);
        if (!gg.length) continue;
        estados.push(sg > 0 ? gg.reduce((b, c) => (c.Fz > b.Fz + tol ? c : b)) : gg.reduce((b, c) => (c.Fz < b.Fz - tol ? c : b)));
      }
    }
    // Qué gobierna cada estado y verificación de cobertura contra todos los patrones
    const iEst = estados.map((c) => cand.indexOf(c));
    const razones = new Map(estados.map((c) => [c.sap, []]));
    const agregados = [];
    efectos.forEach((e, k) => {
      const j = iEst.find((i) => cubre[k][i]);
      if (j !== undefined) razones.get(cand[j].sap).push(e.txt);
      else {
        const i = elegidos.find((q) => cubre[k][q]);
        if (i === undefined) return;
        if (!razones.has(cand[i].sap)) { razones.set(cand[i].sap, []); estados.push(cand[i]); agregados.push(cand[i].sap); }
        razones.get(cand[i].sap).push(e.txt);
      }
    });
    const sel = estados.map((c) => ({ c, razones: razones.get(c.sap), agregado: agregados.includes(c.sap) }));
    // Filtro de simetría para las combinaciones de marcos (casos 2 a 4 usan patrones X e Y)
    const selSap = new Set(estados.map((c) => c.sap));
    // casos 1 y 2: sólo patrones de análisis; casos 3 y 4: sólo sentidos no espejo
    const okNombre = (n) => {
      if ((simX && /WXN|−X/.test(n)) || (simY && /WYN|−Y/.test(n))) return false;
      const m = n.match(/^C[12]·(W[XY][PN]_\d+)/);
      return m ? selSap.has(m[1]) : true;
    };
    const crit = {};
    for (const m of marcosRes) {
      const env = envolverItems((diaf ? [...m.cm.c1, ...m.cm.c2, ...m.cm.c3, ...m.cm.c4] : [...m.cm.c1, ...m.cm.c3]).filter((it) => okNombre(it.nombre)));
      m.env = env;
      for (const [el, o] of Object.entries(env)) {
        const v = Math.max(o.max, -o.min);
        if (!crit[el] || v > crit[el].v * 1.01) crit[el] = { v, ejes: [m.mc.eje] };
        else if (v > crit[el].v * 0.99) crit[el].ejes.push(m.mc.eje);
      }
    }
    // Marcos a modelar: cobertura mínima de los máximos (+ y −) de cada elemento, tolerancia 3 %
    const efMar = [];
    const keys = [...new Set(marcosRes.flatMap((m) => Object.keys(m.env)))];
    for (const k of keys) for (const sg of [1, -1]) {
      const v = marcosRes.map((m) => m.env[k] ? (sg > 0 ? m.env[k].max : -m.env[k].min) : -Infinity);
      const mx = Math.max(...v); if (mx > tol) efMar.push({ k, sg, v, mx });
    }
    const cubM = efMar.map((e) => e.v.map((x) => x >= 0.97 * e.mx - tol));
    const pendM = new Set(efMar.map((_, i) => i)), marcosSel = [];
    while (pendM.size) {
      let best = -1, nb = -1;
      marcosRes.forEach((m, i) => { if (marcosSel.some((x) => x.i === i)) return; let n = 0; for (const k of pendM) if (cubM[k][i]) n++; if (n > nb || (n === nb && best >= 0 && m.mc.trib > marcosRes[best].mc.trib)) { nb = n; best = i; } });
      if (nb <= 0) break;
      const por = [];
      for (const k of [...pendM]) if (cubM[k][best]) { pendM.delete(k); por.push(efMar[k]); }
      marcosSel.push({ i: best, eje: marcosRes[best].mc.eje, por });
    }
    return { diaf, simX, simY, sel, descartados: r.casos.length - sel.length, marcosRes, crit, marcosSel, okNombre, nEfectos: efectos.length };
  }
  function envolverItems(items) {
    const e = {};
    const upd = (key, v, n) => { const o = e[key] || (e[key] = { max: -Infinity, min: Infinity, nmax: '', nmin: '' }); if (v > o.max) { o.max = v; o.nmax = n; } if (v < o.min) { o.min = v; o.nmin = n; } };
    for (const it of items) { upd('colXm', it.colXm, it.nombre); upd('colXp', it.colXp, it.nombre); for (const v of it.vigas) upd('viga' + v.faldon, v.w, it.nombre); }
    return e;
  }
  /**
   * Cargas lineales para SAP por estado, agrupando marcos con cargas iguales (p. ej. exteriores, interiores,
   * o un marco con otro ancho tributario). Filas relativas al viento: barlovento / sotavento / lateral.
   */
  function cargasSAP(r, c, geo) {
    const grupos = [];
    for (const mc of r.marcos) {
      const l = r.cargaMarco(c, mc);
      const key = [l.colXm, l.colXp, ...l.vigas.map((v) => v.faldon + v.a.toFixed(2) + v.b.toFixed(2) + ':' + v.w.toFixed(1))].map((x) => typeof x === 'number' ? x.toFixed(1) : x).join('|');
      const g = grupos.find((q) => q.key === key);
      if (g) g.marcos.push(mc); else grupos.push({ key, marcos: [mc], l });
    }
    const S_ = geo.ancho;
    const filas = [];
    const vig = (l, fal) => l.vigas.filter((v) => v.faldon === fal || (fal === 'X−' && v.faldon === 'U'));
    if (c.dir === 'X') {
      const barl = c.sentido > 0 ? 'X−' : 'X+', sot = c.sentido > 0 ? 'X+' : 'X−';
      const pLat = c.muros.find((m) => m.sup === 'Frontón Y−').p;
      filas.push({ el: 'Muro barlovento', ref: 'columna ' + barl, f: (g) => [{ w: barl === 'X−' ? g.l.colXm : g.l.colXp }] });
      filas.push({ el: 'Muro sotavento', ref: 'columna ' + sot, f: (g) => [{ w: sot === 'X−' ? g.l.colXm : g.l.colXp }] });
      filas.push({ el: 'Muro lateral', ref: 'frontones (p × ancho trib.)', f: (g) => [{ w: pLat * g.marcos[0].trib }] });
      if (geo.tipoTecho === 'una') filas.push({ el: 'Techo', ref: c.sentido > 0 ? 'viga, viento desde lado bajo' : 'viga, viento desde lado alto', f: (g) => vig(g.l, 'X−') });
      else {
        filas.push({ el: 'Techo barlovento', ref: 'viga faldón ' + barl, f: (g) => vig(g.l, barl) });
        filas.push({ el: 'Techo sotavento', ref: 'viga faldón ' + sot, f: (g) => vig(g.l, sot) });
      }
    } else {
      filas.push({ el: 'Muro lateral', ref: 'columnas X− y X+', f: (g) => [{ w: g.l.colXm }] });
      if (geo.tipoTecho === 'una') filas.push({ el: 'Techo', ref: 'viga', f: (g) => vig(g.l, 'X−') });
      else {
        filas.push({ el: 'Techo faldón X−', ref: 'viga faldón X−', f: (g) => vig(g.l, 'X−') });
        filas.push({ el: 'Techo faldón X+', ref: 'viga faldón X+', f: (g) => vig(g.l, 'X+') });
      }
    }
    const fr = c.dir === 'Y' ? { barl: c.muros.find((m) => m.rol === 'barlovento'), sot: c.muros.find((m) => m.rol === 'sotavento') } : null;
    return { grupos, filas, frontones: fr, ancho: S_ };
  }

  /**
   * Caso 3 de la Fig. 11 para marcos transversales: 0,75·p del estado X + 0,75·p del estado Y en muros (superpuestos),
   * techo = 100 % del mayor valor del caso 1 entre ambos estados (modo 'S' máxima succión, 'P' máxima presión).
   */
  function cargasCaso3(r, cx, cy, modo, geo) {
    const grupos = [];
    for (const mc of r.marcos) {
      const lx = r.cargaMarco(cx, mc), ly = r.cargaMarco(cy, mc);
      const l = { colXm: 0.75 * (lx.colXm + ly.colXm), colXp: 0.75 * (lx.colXp + ly.colXp), vigas: envTecho([lx.vigas, ly.vigas], modo, 1) };
      const key = [l.colXm, l.colXp, ...l.vigas.map((v) => v.faldon + v.a.toFixed(2) + v.b.toFixed(2) + ':' + v.w.toFixed(1))].map((x) => typeof x === 'number' ? x.toFixed(1) : x).join('|');
      const g = grupos.find((q) => q.key === key);
      if (g) g.marcos.push(mc); else grupos.push({ key, marcos: [mc], l });
    }
    const barl = cx.sentido > 0 ? 'X−' : 'X+', sot = cx.sentido > 0 ? 'X+' : 'X−';
    const vig = (l, fal) => l.vigas.filter((v) => v.faldon === fal || (fal === 'X−' && v.faldon === 'U'));
    const filas = [
      { el: 'Muro barlovento WX + lateral WY', ref: 'columna ' + barl, f: (g) => [{ w: barl === 'X−' ? g.l.colXm : g.l.colXp }] },
      { el: 'Muro sotavento WX + lateral WY', ref: 'columna ' + sot, f: (g) => [{ w: sot === 'X−' ? g.l.colXm : g.l.colXp }] },
    ];
    if (geo.tipoTecho === 'una') filas.push({ el: 'Techo', ref: 'viga', f: (g) => vig(g.l, 'X−') });
    else { filas.push({ el: 'Techo faldón ' + barl, ref: 'viga faldón ' + barl, f: (g) => vig(g.l, barl) }); filas.push({ el: 'Techo faldón ' + sot, ref: 'viga faldón ' + sot, f: (g) => vig(g.l, sot) }); }
    return { grupos, filas };
  }

  /**
   * Casos 2 y 4 de la Fig. 11 por nivel (diafragma): fuerza de piso F = k·(|pW| + |pL|)·B·htrib y Mz = F·e, e = 0,15B.
   * k = 0,75 (caso 2) o 0,563 (caso 4, ambas direcciones simultáneas). alturas: alturas de entrepiso desde el suelo.
   */
  function torsionNiveles(cx, cy, geo, alturas, k) {
    const niv = [];
    let z = 0;
    const n = alturas.length;
    for (let i = 0; i < n; i++) {
      z += alturas[i];
      const htrib = alturas[i] / 2 + (i + 1 < n ? alturas[i + 1] / 2 : 0);
      const fila = { nivel: i + 1, z, htrib };
      for (const [dir, c, B] of [['X', cx, geo.largo], ['Y', cy, geo.ancho]]) {
        if (!c) continue;
        const w = c.muros.find((m) => m.rol === 'barlovento'), l = c.muros.find((m) => m.rol === 'sotavento');
        const F = k * (Math.abs(w.pext) + Math.abs(l.pext)) * B * htrib;
        fila[dir] = { B, e: 0.15 * B, pW: w.pext, pL: l.pext, F, Mz: F * 0.15 * B };
      }
      niv.push(fila);
    }
    return niv;
  }

  /** Combinaciones que gobiernan algún elemento del marco en cada caso de diseño (sin repetir), con filtro opcional. */
  function combosGobernantes(cm, ok) {
    const out = {};
    const nom = { colXm: 'columna X−', colXp: 'columna X+', 'vigaX−': 'viga X−', 'vigaX+': 'viga X+', vigaU: 'viga techo' };
    for (const k of ['c1', 'c2', 'c3', 'c4']) {
      const items = cm[k].filter((it) => !ok || ok(it.nombre));
      const env = envolverItems(items);
      const names = new Map();
      for (const [el, o] of Object.entries(env)) {
        if (o.max > 1e-9) { const l = names.get(o.nmax) || []; l.push('máx + ' + (nom[el] || el)); names.set(o.nmax, l); }
        if (o.min < -1e-9) { const l = names.get(o.nmin) || []; l.push('máx − ' + (nom[el] || el)); names.set(o.nmin, l); }
      }
      out[k] = [...names.entries()].map(([n, why]) => Object.assign({}, items.find((it) => it.nombre === n), { por: why }));
      out[k].env = env;
    }
    return out;
  }

  function cyrMuro(g, geo, el) {
    const th = geo.tipoTecho === 'plana' ? 0 : +geo.theta;
    const rad = th * Math.PI / 180;
    const rise = geo.tipoTecho === 'dos' ? (geo.ancho / 2) * Math.tan(rad) : geo.tipoTecho === 'una' ? geo.ancho * Math.tan(rad) : 0;
    const h = th <= 10 ? geo.hAlero : geo.hAlero + rise / 2;
    const qh = qz(g, h).q;
    const menor = Math.min(geo.largo, geo.ancho);
    let a = Math.max(Math.min(0.1 * menor, 0.4 * h), 0.04 * menor, 0.9);
    if (th <= 7 && menor > 90) a = Math.min(a, 0.8 * h);
    const A = el.H * Math.max(el.s, el.H / 3); // 3.4: ancho efectivo ≥ luz/3
    const zonas = [4, 5].map((z) => {
      const c = GCpMuro(z, A, th);
      let pmax = qh * g.Kd * (c.pos + g.GCpi), pmin = qh * g.Kd * (c.neg - g.GCpi);
      const minP = pmax < 250, minN = -pmin < 250;
      pmax = Math.max(pmax, 250); pmin = Math.min(pmin, -250);
      return { zona: z, GCpPos: c.pos, GCpNeg: c.neg, pmax, pmin, minP, minN,
        wmax: pmax * el.s, wmin: pmin * el.s, Mmax: Math.max(pmax, -pmin) * el.s * el.H * el.H / 8, R: Math.max(pmax, -pmin) * el.s * el.H / 2 };
    });
    return { h, qh, a, A, red: th <= 10, zonas, aplica: h <= 18.3 };
  }

  /* ================= Anexo A: método simplificado para el SPRFV ================= */
  // Tabla – Figura A.1 (dos aguas): C del faldón a barlovento según θ (sólo un valor)
  function CA1(th) {
    if (th > 60) return null;
    return lerp(th, [0, 20, 30, 45, 60], [-0.85, -0.85, 0.4, 0.4, 0.6]);
  }
  // Tabla – Figura A.2 (pendiente única): C presión y C succión del techo a barlovento
  function CA2(th) {
    if (th > 60) return null;
    return { pres: lerp(th, [0, 10, 45, 60], [0.1, 0.1, 0.55, 0.55]), succ: lerp(th, [0, 10, 45, 60], [-0.85, -0.85, -0.2, -0.2]) };
  }

  /**
   * Anexo A: pz = p0 · Kz · C, con Kz en z = h (Tabla 5). I, Kzt, Ke = 1; Kd y G incluidos en C; sin GCpi.
   * Techo plano: se trata como pendiente única con θ = 0 (Figura A.2).
   * geo = { largo, ancho, hAlero, tipoTecho, theta, sepMarcos }, g = { V, p0, exp, kzMetodo, cat, cerramiento, topo }
   */
  function anexoA(g, geo, opt) {
    const tipo = geo.tipoTecho;
    const th = tipo === 'plana' ? 0 : +geo.theta;
    const rad = th * Math.PI / 180;
    const S = geo.ancho, Lg = geo.largo;
    const rise = tipo === 'dos' ? (S / 2) * Math.tan(rad) : tipo === 'una' ? S * Math.tan(rad) : 0;
    const h = geo.hAlero + rise / 2; // Nota 2: altura media del techo
    const kz = Kz(h, g.exp, g.kzMetodo);
    const p0 = g.p0;
    const pz = p0 * kz;
    const frontal = opt && opt.frontal060 ? 0.6 : 0.7; // Tabla A.1: 0,7; esquema caso 2 de la Fig. A.1: +0,60
    const checks = [
      { ok: g.cat === 'I' || g.cat === 'II', txt: 'Categoría de ocupación I o II' },
      { ok: g.cerramiento === 'cerrado', txt: 'Construcción cerrada' },
      { ok: geo.hAlero + rise <= 6.0, txt: 'Altura ≤ 6,0 m (' + round(geo.hAlero + rise, 2) + ' m)' },
      { ok: S * Lg < 500, txt: 'Planta < 500 m² (' + round(S * Lg, 1) + ' m²)' },
      { ok: th <= 60, txt: 'θ ≤ 60°' },
      { ok: !g.topo, txt: 'Sin efectos topográficos (Nota 2)' },
    ];
    const casos = [];
    const halves = tipo === 'dos' ? [['X−', 0, S / 2], ['X+', S / 2, S]] : [['U', 0, S]];
    const push = (dir, sentido, idx, nombre, muroCp, techo) => {
      const muros = [
        { sup: 'Muro X−', Cp: muroCp['X−'], rol: dir === 'X' ? (sentido > 0 ? 'barlovento' : 'sotavento') : 'lateral' },
        { sup: 'Muro X+', Cp: muroCp['X+'], rol: dir === 'X' ? (sentido > 0 ? 'sotavento' : 'barlovento') : 'lateral' },
        { sup: 'Frontón Y−', Cp: muroCp['Y−'], rol: dir === 'Y' ? (sentido > 0 ? 'barlovento' : 'sotavento') : 'lateral' },
        { sup: 'Frontón Y+', Cp: muroCp['Y+'], rol: dir === 'Y' ? (sentido > 0 ? 'sotavento' : 'barlovento') : 'lateral' },
      ].map((m) => Object.assign(m, { pext: pz * m.Cp, p: pz * m.Cp }));
      const t = techo.map((x) => Object.assign(x, { eje: 'x', pext: pz * x.Cp, p: pz * x.Cp }));
      const signo = sentido > 0 ? '+' : '−';
      casos.push({ n: casos.length + 1, dir, sentido, variante: { nombre }, gcpi: 0, nombre: signo + 'W' + dir,
        sap: 'W' + dir + (sentido > 0 ? 'P' : 'N') + '_' + idx, desc: signo + 'W' + dir + ' · ' + nombre, muros, techo: t });
    };
    const wallsX = (s) => ({ 'X−': s > 0 ? 0.7 : -0.6, 'X+': s > 0 ? -0.6 : 0.7, 'Y−': -0.6, 'Y+': -0.6 });
    const wallsY = (s) => ({ 'X−': -0.6, 'X+': -0.6, 'Y−': s > 0 ? frontal : -0.6, 'Y+': s > 0 ? -0.6 : frontal });
    if (tipo === 'dos') {
      const cw = CA1(th);
      for (const s of [1, -1]) {
        push('X', s, 1, 'caso 1: faldón barlovento C = ' + (cw === null ? '—' : cw.toFixed(2)), wallsX(s), [
          { faldon: 'X−', a: 0, b: S / 2, Cp: s > 0 ? cw : -0.6 }, { faldon: 'X+', a: S / 2, b: S, Cp: s > 0 ? -0.6 : cw }]);
      }
      for (const s of [1, -1]) {
        push('Y', s, 1, 'caso 2: −0,85 en X− / −0,60 en X+', wallsY(s), [
          { faldon: 'X−', a: 0, b: S / 2, Cp: -0.85 }, { faldon: 'X+', a: S / 2, b: S, Cp: -0.6 }]);
        push('Y', s, 2, 'caso 2: −0,60 en X− / −0,85 en X+', wallsY(s), [
          { faldon: 'X−', a: 0, b: S / 2, Cp: -0.6 }, { faldon: 'X+', a: S / 2, b: S, Cp: -0.85 }]);
      }
    } else {
      // pendiente única (y plano): el techo sube hacia X+; +WX = viento desde el lado bajo (caso 1A)
      const c2 = CA2(th);
      push('X', 1, 1, 'caso 1A: techo en presión C = ' + c2.pres.toFixed(2), wallsX(1), [{ faldon: 'U', a: 0, b: S, Cp: c2.pres }]);
      push('X', 1, 2, 'caso 1A: techo en succión C = ' + c2.succ.toFixed(2), wallsX(1), [{ faldon: 'U', a: 0, b: S, Cp: c2.succ }]);
      push('X', -1, 1, 'caso 1B: techo −0,60', wallsX(-1), [{ faldon: 'U', a: 0, b: S, Cp: -0.6 }]);
      if (tipo === 'plana') {
        // en techo plano el caso 1A aplica en ambos sentidos
        push('X', -1, 2, 'caso 1A (plano): techo en succión C = ' + c2.succ.toFixed(2), wallsX(-1), [{ faldon: 'U', a: 0, b: S, Cp: c2.succ }]);
        push('X', -1, 3, 'caso 1A (plano): techo en presión C = ' + c2.pres.toFixed(2), wallsX(-1), [{ faldon: 'U', a: 0, b: S, Cp: c2.pres }]);
      }
      for (const s of [1, -1]) push('Y', s, 1, 'caso 2: techo −0,60', wallsY(s), [{ faldon: 'U', a: 0, b: S, Cp: -0.6 }]);
    }
    const Awall = { 'Muro X−': Lg * geo.hAlero, 'Muro X+': Lg * (geo.hAlero + (tipo === 'una' ? rise : 0)) };
    const Agable = S * geo.hAlero + S * rise / 2;
    const post = procesarCasos(casos, { tipo: tipo === 'plana' ? 'una' : tipo, rad, S, Lg, hAlero: geo.hAlero, rise, Awall, Agable, sepMarcos: +geo.sepMarcos, ejesY: geo.ejesY, ejesX: geo.ejesX });
    return Object.assign({ metodo: 'anexoA', theta: th, h, rise, Kh: kz, p0, pz, qh: pz, checks, aplica: checks.every((c) => c.ok), casos, CA1: CA1(th), CA2: CA2(th), Awall, Agable }, post);
  }

  /* ================= Método simplificado (edificios bajos, envolvente) ================= */
  // GCpf – Caso de carga A (viento transversal a la cumbrera), según θ
  const ENV_A_TH = [5, 20, 30, 90];
  const ENV_A = {
    '1': [0.4, 0.53, 0.56, 0.56], '2': [-0.69, -0.69, 0.21, 0.56], '3': [-0.37, -0.48, -0.43, -0.37], '4': [-0.29, -0.43, -0.37, -0.37],
    '1E': [0.61, 0.8, 0.69, 0.69], '2E': [-1.07, -1.07, 0.27, 0.69], '3E': [-0.53, -0.69, -0.53, -0.48], '4E': [-0.43, -0.64, -0.48, -0.48],
  };
  const ENV_B = { '1': -0.45, '2': -0.69, '3': -0.37, '4': -0.45, '5': 0.4, '6': -0.29, '1E': -0.48, '2E': -1.07, '3E': -0.53, '4E': -0.48, '5E': 0.61, '6E': -0.43 };
  const ZONA_DESC = {
    '1': 'Muro barlovento', '2': 'Techo barlovento', '3': 'Techo sotavento', '4': 'Muro sotavento',
    '5': 'Muro frontal (barlovento, caso B)', '6': 'Muro posterior (sotavento, caso B)',
  };
  function GCpfA(zona, th) {
    const arr = ENV_A[zona];
    if (th <= 5) return arr[0];
    if (th >= 30 && th <= 45) return arr[2];
    if (th < 20) return lerp(th, [5, 20], [arr[0], arr[1]]);
    if (th < 30) return lerp(th, [20, 30], [arr[1], arr[2]]);
    return lerp(th, [45, 90], [arr[2], arr[3]]);
  }

  function simplificado(g, geo, opt) {
    const th = geo.tipoTecho === 'plana' ? 0 : +geo.theta;
    const rad = th * Math.PI / 180;
    const rise = geo.tipoTecho === 'dos' ? (geo.ancho / 2) * Math.tan(rad) : geo.tipoTecho === 'una' ? geo.ancho * Math.tan(rad) : 0;
    const h = th <= 10 ? geo.hAlero : geo.hAlero + rise / 2;
    const menor = Math.min(geo.largo, geo.ancho);
    const qH = qz(g, h);
    const qh = qH.q;
    const Kd = opt && opt.sinKd ? 1 : g.Kd;
    let a = Math.min(0.1 * menor, 0.4 * h);
    a = Math.max(a, 0.04 * menor, 0.9);
    // Excepción (Fig. 12): θ = 0 a 7° y menor dimensión > 90 m → a ≤ 0,8h
    if (th <= 7 && menor > 90) a = Math.min(a, 0.8 * h);
    const checks = [
      { ok: h <= 18, txt: 'h = ' + round(h, 2) + ' m ≤ 18 m' },
      { ok: h <= menor, txt: 'h ≤ menor dimensión horizontal (' + round(menor, 2) + ' m)' },
      { ok: g.cerramiento === 'cerrado' || g.cerramiento === 'parcCerrado', txt: 'Edificio cerrado o parcialmente cerrado' },
    ];
    const fila = (zona, GCpf, caso) => ({
      zona, caso, desc: ZONA_DESC[zona.replace('E', '')] + (zona.includes('E') ? ' (borde)' : ''), GCpf,
      pos: qh * Kd * (GCpf - g.GCpi), neg: qh * Kd * (GCpf + g.GCpi),
    });
    const A = ['1', '2', '3', '4', '1E', '2E', '3E', '4E'].map((z) => fila(z, GCpfA(z, th), 'A'));
    const Bc = ['1', '2', '3', '4', '5', '6', '1E', '2E', '3E', '4E', '5E', '6E'].map((z) => fila(z, ENV_B[z], 'B'));
    const zona2 = Math.min(0.5 * geo.ancho, 2.5 * geo.hAlero); // 7.3.2.1: franja de zona 2/2E si GCpf < 0
    return { theta: th, h, rise, a, dosA: 2 * a, zona2, Kh: qH.Kz, qh, Kd, casoA: A, casoB: Bc, checks };
  }

  /* ================= Contenedor (volcamiento, deslizamiento, anclaje) ================= */
  /**
   * Contenedor tipo oficina/bodega: edificio cerrado pequeño de techo plano.
   * c.metodo = 'cap6' (p = q·Kd·G·Cp − qh·Kd·GCpi) o 'anexoA' (pz = p0·Kz·C, sin presión interna).
   * Sobre apoyos: §6.3.1.1 (edificio elevado). Las cargas en la cara inferior no se usan para reducir el volcamiento;
   * los apoyos reciben F = qz·Kd·G·1,3·A con z = hApoyo + 0,25 (h − hApoyo) (§6.3.1.1.2).
   * Carga mínima: 0,25 kN/m² sobre el área de muro (§6.1.5).
   */
  function contenedor(g, c) {
    const H = c.alto * c.niveles;
    const h = c.hApoyo + H;
    const anexo = c.metodo === 'anexoA';
    const kz = Kz(h, g.exp, g.kzMetodo);
    const qh = anexo ? g.p0 * kz : qz(g, h).q;
    const Kd = g.Kd, G = g.G, GCpi = g.GCpi;
    const pesoN = c.peso * c.niveles * G_ACC;
    const zs = c.hApoyo + 0.25 * (h - c.hApoyo);
    const qs = qz(g, zs).q;
    const res = [];
    for (const dir of ['transversal', 'longitudinal']) {
      const B = dir === 'transversal' ? c.largo : c.ancho;
      const L = dir === 'transversal' ? c.ancho : c.largo;
      const hL = h / L, LB = L / B;
      const CpLee = anexo ? -0.6 : CpSotavento(LB);
      const CpW = anexo ? 0.7 : 0.8;
      const pNeta = anexo ? qh * (CpW - CpLee) : qh * Kd * G * (CpW - CpLee);
      const Aface = B * H;
      const Fcalc = pNeta * Aface;
      const Fmin = 250 * Aface;
      const F = Math.max(Fcalc, Fmin);
      const brazoF = c.hApoyo + H / 2;
      const Fsup = c.hApoyo > 0 ? qs * Kd * G * 1.3 * (+c.Asup || 0) : 0;
      const brazoSup = c.hApoyo / 2;
      let tramos = [], U = 0, MU = 0;
      if (c.techo === false) {
        // techo despreciado: sin levantamiento
      } else if (anexo) {
        tramos = [{ x0: 0, x1: L, Cp: -0.85 }]; // Fig. A.2, θ = 0: caso 1A en succión
        for (const t of tramos) { const up = -qh * t.Cp * (t.x1 - t.x0) * B; U += up; MU += up * (L - (t.x0 + t.x1) / 2); }
      } else {
        tramos = zonasTecho(L, h, hL);
        for (const t of tramos) {
          const pz_ = qh * Kd * (G * t.Cp - GCpi);
          const up = -pz_ * (t.x1 - t.x0) * B;
          U += up; MU += up * (L - (t.x0 + t.x1) / 2);
        }
      }
      const Mo = F * brazoF + Fsup * brazoSup + MU;
      const Mr = pesoN * L / 2;
      const Ft = F + Fsup;
      const FSv = Mo > 0 ? Mr / Mo : Infinity;
      const FSd = Ft > 0 ? (c.mu * Math.max(0, pesoN - U)) / Ft : Infinity;
      const FSu = U > 0 ? pesoN / U : Infinity;
      const Tline = Math.max(0, (c.gW * Mo - c.gD * Mr) / L);
      const Tanc = Tline / c.anclajesLado;
      const Vanc = (c.gW * Ft) / (2 * c.anclajesLado);
      // Presiones en las caras por nivel (costados). Cap. 6: barlovento con qz al tope de cada nivel.
      const niveles = [];
      for (let k = 1; k <= c.niveles; k++) {
        const z0 = c.hApoyo + (k - 1) * c.alto, z1 = c.hApoyo + k * c.alto;
        const qW = anexo ? qh : qz(g, z1).q;
        const pi = anexo ? 0 : qh * Kd * GCpi;
        const ext = (q, Cp) => anexo ? q * Cp : q * Kd * G * Cp;
        const cara = (q, Cp) => ({ Cp, pos: ext(q, Cp) - pi, neg: ext(q, Cp) + pi });
        const barl = cara(qW, CpW), sot = cara(qh, CpLee), lat = cara(qh, anexo ? -0.6 : -0.7);
        niveles.push({ k, z0, z1, qW, barl, sot, lat, Fh: (ext(qW, CpW) - ext(qh, CpLee)) * B * c.alto });
      }
      res.push({ dir, B, L, hL, LB, CpW, CpLee, pNeta, Aface, Fcalc, Fmin, F, Fsup, brazoF, U, MU, Mo, Mr, FSv, FSd, FSu, Tline, Tanc, Vanc, tramos, niveles });
    }
    const checksA = [
      { ok: g.cat === 'I' || g.cat === 'II', txt: 'Categoría I o II' },
      { ok: g.cerramiento === 'cerrado', txt: 'Cerrado' },
      { ok: h <= 6, txt: 'Altura ≤ 6,0 m' },
      { ok: c.largo * c.ancho < 500, txt: 'Planta < 500 m²' },
      { ok: !g.topo, txt: 'Sin efectos topográficos' },
    ];
    return { H, h, Kh: kz, qh, zs, qs, pesoN, res, metodo: anexo ? 'anexoA' : 'cap6', checksA };
  }

  /* ================= Techumbre específica (para artefacto de cerchas) ================= */
  /**
   * Devuelve los parámetros q, Cpi, Cp barlovento y Cp sotavento para cada combinación.
   * q entregado = qh·Kd (kPa) y Cp entregado = G·Cp, de modo que p = q·(Cp − Cpi).
   */
  function techumbre(g, t) {
    if (t.metodo === 'anexoA') return techumbreAnexoA(g, t);
    const th = t.tipoTecho === 'plana' ? 0 : +t.theta;
    const rad = th * Math.PI / 180;
    const rise = t.tipoTecho === 'dos' ? (t.luz / 2) * Math.tan(rad) : t.tipoTecho === 'una' ? t.luz * Math.tan(rad) : 0;
    const h = th <= 10 ? t.hAlero : t.hAlero + rise / 2;
    const qH = qz(g, h);
    const qh = qH.q;
    const qOut = (qh * g.Kd) / 1000; // kPa
    const G = g.G;
    let setsCp = [];
    let dirInfo;
    if (t.direccion === 'normal') {
      const L = t.luz, hL = h / L;
      dirInfo = { L, hL };
      if (th >= 10 && t.tipoTecho !== 'plana') {
        const ww = CpTechoBarlovento(th, hL);
        const lw = CpTechoSotavento(th, hL);
        if (ww.neg !== null) setsCp.push({ nombre: 'Barlovento en succión', ww: ww.neg, lw });
        setsCp.push({ nombre: ww.neg !== null ? 'Barlovento en presión' : 'Barlovento', ww: ww.pos, lw });
      } else {
        const half = t.tipoTecho === 'una' ? L : L / 2;
        const ww = CpZonaPromedio(0, half, h, hL, L);
        const lw = t.tipoTecho === 'una' ? ww : CpZonaPromedio(half, L, h, hL, L);
        setsCp.push({ nombre: 'Zonas por distancia (promedio por faldón)', ww, lw });
        setsCp.push({ nombre: 'Caso alternativo', ww: -0.18, lw: -0.18 });
      }
    } else {
      const L = t.largo, hL = h / L;
      dirInfo = { L, hL };
      const x = Math.min(Math.max(+t.xCercha, 0), L);
      const Cp = CpTechoZona(x, h, hL);
      setsCp.push({ nombre: 'Cercha a ' + round(x, 2) + ' m del borde de barlovento', ww: Cp, lw: Cp });
      setsCp.push({ nombre: 'Caso alternativo', ww: -0.18, lw: -0.18 });
    }
    const combos = [];
    for (const s of setsCp) {
      for (const sg of g.GCpi > 0 ? [1, -1] : [0]) {
        const cpi = sg * g.GCpi;
        combos.push({
          nombre: s.nombre, q: qOut, Cpi: cpi, CpW: G * s.ww, CpL: G * s.lw, CpWraw: s.ww, CpLraw: s.lw,
          pW: qOut * (G * s.ww - cpi), pL: qOut * (G * s.lw - cpi),
        });
      }
    }
    return { theta: th, h, rise, Kh: qH.Kz, qh, qOut, dirInfo, combos };
  }

  /** Techumbre por Anexo A: q = p0·Kz(h) (kPa), Cp = C, Cpi = 0 (el anexo no usa presión interna). */
  function techumbreAnexoA(g, t) {
    const tipo = t.tipoTecho;
    const th = tipo === 'plana' ? 0 : +t.theta;
    const rad = th * Math.PI / 180;
    const rise = tipo === 'dos' ? (t.luz / 2) * Math.tan(rad) : tipo === 'una' ? t.luz * Math.tan(rad) : 0;
    const h = t.hAlero + rise / 2;
    const kz = Kz(h, g.exp, g.kzMetodo);
    const qOut = g.p0 * kz / 1000;
    const sets = [];
    if (tipo === 'dos') {
      const cw = CA1(th);
      if (t.direccion === 'normal') sets.push({ nombre: 'Caso 1 (perpendicular)', ww: cw, lw: -0.6 });
      else {
        sets.push({ nombre: 'Caso 2: −0,85 / −0,60', ww: -0.85, lw: -0.6 });
        sets.push({ nombre: 'Caso 2: −0,60 / −0,85', ww: -0.6, lw: -0.85 });
      }
    } else {
      const c2 = CA2(th);
      if (t.direccion === 'normal') {
        sets.push({ nombre: 'Caso 1A presión (viento desde lado bajo)', ww: c2.pres, lw: c2.pres });
        sets.push({ nombre: 'Caso 1A succión (viento desde lado bajo)', ww: c2.succ, lw: c2.succ });
        if (tipo === 'una') sets.push({ nombre: 'Caso 1B (viento desde lado alto)', ww: -0.6, lw: -0.6 });
      } else sets.push({ nombre: 'Caso 2 (paralelo)', ww: -0.6, lw: -0.6 });
    }
    const combos = sets.filter((x) => x.ww !== null).map((x) => ({
      nombre: x.nombre, q: qOut, Cpi: 0, CpW: x.ww, CpL: x.lw, CpWraw: x.ww, CpLraw: x.lw, pW: qOut * x.ww, pL: qOut * x.lw,
    }));
    return { metodo: 'anexoA', theta: th, h, rise, Kh: kz, qh: g.p0 * kz, qOut, dirInfo: { L: t.direccion === 'normal' ? t.luz : t.largo, hL: h / (t.direccion === 'normal' ? t.luz : t.largo) }, combos };
  }

  const api = {
    G_ACC, ZONAS, IMPORTANCIA, KD, EXPOSICION, TERRENO, TABLA5, TABLA4, CERRAMIENTO, TOPO,
    lerp, round, Nm2_to_kgf, Kz, Ke, Kzt, qz, clasificarCerramiento, Ri,
    CpSotavento, CpTechoBarlovento, CpTechoSotavento, CpTechoZona, zonasTecho, CpZonaPromedio,
    GCpfA, ENV_A, ENV_B, direccional, galponSAP, anexoA, CA1, CA2, procesarCasos, parseEjes, letraEje, casosMarco, analisisGalpon, combosGobernantes, cargasSAP, cargasCaso3, torsionNiveles, envTecho, cyrMuro, GCpMuro, trazaCpTecho, redArea, simplificado, contenedor, techumbre,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NCh432 = api;
})(typeof window !== 'undefined' ? window : globalThis);
