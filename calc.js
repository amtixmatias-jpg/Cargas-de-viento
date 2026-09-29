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
    { id: 'I-A', lat: "17°29'S – 27°22'S", alt: '< 2000', V: 27, des: 'Límite Norte hasta Copiapó' },
    { id: 'I-B', lat: "17°29'S – 27°22'S", alt: '≥ 2000', V: 30, des: 'Límite Norte hasta Copiapó' },
    { id: 'II-A', lat: "27°22'S – 29°54'S", alt: '< 1500', V: 27, des: 'Zona Centro' },
    { id: 'II-B', lat: "27°22'S – 29°54'S", alt: '≥ 1500', V: 35, des: 'Zona Centro' },
    { id: 'III-A', lat: "29°54'S – 37°28'S", alt: '< 1000', V: 34, des: 'Zona Sur' },
    { id: 'III-B', lat: "29°54'S – 37°28'S", alt: '≥ 1000', V: 35, des: 'Zona Sur' },
    { id: 'IV-A', lat: "37°28'S – 41°28'S", alt: '< 600', V: 37, des: 'Zona Sur hasta Chiloé' },
    { id: 'IV-B', lat: "37°28'S – 41°28'S", alt: '≥ 600', V: 40, des: 'Zona Sur hasta Chiloé' },
    { id: 'V', lat: "41°28'S – 50°S", alt: '—', V: 40, des: 'Zona Austral' },
    { id: 'VI', lat: "50°S – 56°32'S", alt: '—', V: 44, des: 'Zona Austral' },
    { id: 'NC1', lat: '—', alt: '—', V: 32, des: 'Isla de Pascua' },
    { id: 'NC2', lat: '—', alt: '—', V: 50, des: 'Juan Fernández' },
    { id: 'NC3', lat: '—', alt: '—', V: 60, des: 'Antártica chilena' },
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

  /*
   * Tabla 6 (α, zg, zmín). No venía en la planilla; estos parámetros reproducen
   * exactamente la Tabla 5 (Kz = 2,41 (z/zg)^(2/α)) al redondear a 2 decimales.
   */
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
            for (const m of muros) m.p = pe(m.Cp) - pi;
            const techo = techoTramos(dir, sentido, v).map((t) => Object.assign(t, { p: pe(t.Cp) - pi }));

            // Resultantes (la presión interna se anula sobre la envolvente cerrada; se usa la externa)
            let Fx = 0, Fy = 0, Fz = 0;
            for (const m of muros) {
              const pext = pe(m.Cp);
              if (m.sup === 'Muro X−') Fx += pext * Awall['Muro X−'];
              if (m.sup === 'Muro X+') Fx -= pext * Awall['Muro X+'];
              if (m.sup === 'Frontón Y−') Fy += pext * Agable;
              if (m.sup === 'Frontón Y+') Fy -= pext * Agable;
            }
            for (const t of techo) {
              const pext = pe(t.Cp);
              if (t.eje === 'x') {
                const Aplan = (t.b - t.a) * Lg;
                Fz -= pext * Aplan; // + hacia arriba
                const sx = t.faldon === 'X+' ? -1 : 1; // X− y techo una agua: normal exterior (−sinθ, 0, cosθ)
                if (tipo !== 'plana') Fx += sx * pext * Aplan * Math.tan(rad);
              } else {
                const Aplan = (t.b - t.a) * S;
                Fz -= pext * Aplan;
                // en dirección Y las componentes horizontales de ambos faldones se anulan (dos aguas)
                if (tipo === 'una') Fx += pext * Aplan * Math.tan(rad);
              }
            }
            const signo = sentido > 0 ? '+' : '−';
            casos.push({
              n, dir, sentido, variante: v, iv, gcpi,
              nombre: signo + 'W' + dir,
              sap: 'W' + dir + (sentido > 0 ? 'P' : 'N') + '_' + (iv * (g.GCpi > 0 ? 2 : 1) + (sg >= 0 ? 1 : 2)),
              desc: signo + 'W' + dir + ' · techo ' + v.nombre + ' · GCpi ' + (gcpi > 0 ? '+' : gcpi < 0 ? '−' : '') + Math.abs(gcpi).toFixed(2),
              muros, techo, Fx, Fy, Fz,
            });
          }
        });
      }
    }

    // Envolvente por superficie (muros y faldones completos promediados por área)
    const env = {};
    const upd = (sup, p, c) => {
      const e = env[sup] || (env[sup] = { sup, max: -Infinity, min: Infinity, cmax: null, cmin: null });
      if (p > e.max) { e.max = p; e.cmax = c.sap; }
      if (p < e.min) { e.min = p; e.cmin = c.sap; }
    };
    const faldones = tipo === 'una' ? [['Techo', 0, S]] : [['Faldón X−', 0, S / 2], ['Faldón X+', S / 2, S]];
    for (const c of casos) {
      for (const m of c.muros) upd(m.sup, m.p, c);
      for (const t of c.techo) {
        const nom = t.eje === 'y' ? (tipo === 'una' ? 'Techo' : 'Faldones X− y X+') : (t.faldon === 'U' ? 'Techo' : 'Faldón ' + t.faldon);
        // valor máximo local de cada zona
        if (t.eje === 'y' && tipo !== 'una') { upd('Faldón X−', t.p, c); upd('Faldón X+', t.p, c); } else upd(nom, t.p, c);
      }
    }
    const gov = (key, fn) => casos.reduce((b, c) => (fn(c) > fn(b) ? c : b), casos[0]);
    const gobiernan = {
      FxMax: gov('Fx', (c) => c.Fx), FxMin: gov('Fx', (c) => -c.Fx), FyMax: gov('Fy', (c) => c.Fy), FyMin: gov('Fy', (c) => -c.Fy),
      FzMax: gov('Fz', (c) => c.Fz), FzMin: gov('Fz', (c) => -c.Fz),
    };

    // Cargas en marcos transversales (plano XZ), separados sepMarcos a lo largo de Y
    const sep = +geo.sepMarcos;
    const marcos = [];
    if (sep > 0) {
      const nEsp = Math.max(1, Math.round(Lg / sep));
      for (let i = 0; i <= nEsp; i++) {
        const y = Math.min(i * sep, Lg);
        const a = Math.max(0, y - sep / 2), b = Math.min(Lg, y + sep / 2);
        marcos.push({ i: i + 1, y, a, b, trib: b - a });
      }
    }
    function cargaMarco(c, mc) {
      // w [N/m] = p × ancho tributario; en Y el Cp del techo se promedia sobre la franja tributaria
      const wm = (sup) => c.muros.find((m) => m.sup === sup).p * mc.trib;
      const res = { colXm: wm('Muro X−'), colXp: wm('Muro X+'), vigas: [] };
      if (c.dir === 'X') {
        for (const t of c.techo) res.vigas.push({ faldon: t.faldon, a: t.a, b: t.b, w: t.p * mc.trib });
      } else {
        let s = 0;
        for (const t of c.techo) { const lo = Math.max(t.a, mc.a), hi = Math.min(t.b, mc.b); if (hi > lo) s += t.p * (hi - lo); }
        const halvesM = tipo === 'una' ? [['U', 0, S]] : [['X−', 0, S / 2], ['X+', S / 2, S]];
        for (const [f, a, b] of halvesM) res.vigas.push({ faldon: f, a, b, w: s });
      }
      return res;
    }

    return {
      theta: th, h, rise, Kh: qH.Kz, qh, hLx, hLy, CpLeeX, CpLeeY, ww, lw, zonasX, zonasY, fbX, fbY,
      traza: slopeRoof ? trazaCpTecho(th, hLx) : null, slopeRoof,
      Awall, Agable, casos, env: Object.values(env), gobiernan, marcos, cargaMarco,
    };
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
    return { theta: th, h, rise, a, dosA: 2 * a, Kh: qH.Kz, qh, Kd, casoA: A, casoB: Bc, checks };
  }

  /* ================= Contenedor (volcamiento, deslizamiento, anclaje) ================= */
  function contenedor(g, c) {
    const H = c.alto * c.niveles;
    const h = c.hApoyo + H; // techo plano: h = altura del techo
    const qH = qz(g, h);
    const qh = qH.q;
    const Kd = g.Kd, G = g.G, GCpi = g.GCpi;
    const pesoN = c.peso * c.niveles * G_ACC;
    const res = [];
    for (const dir of ['transversal', 'longitudinal']) {
      const B = dir === 'transversal' ? c.largo : c.ancho; // cara expuesta
      const L = dir === 'transversal' ? c.ancho : c.largo; // profundidad (brazo de volcamiento)
      const hL = h / L, LB = L / B;
      const CpLee = CpSotavento(LB);
      const pNeta = qh * Kd * G * (0.8 - CpLee); // presión interna se anula
      const Aface = B * H;
      const F = pNeta * Aface;
      const brazoF = c.hApoyo + H / 2;
      // Levantamiento del techo con +GCpi (más desfavorable)
      const tramos = zonasTecho(L, h, hL);
      let U = 0, MU = 0;
      for (const t of tramos) {
        const pz = qh * Kd * (G * t.Cp - GCpi); // negativa = succión
        const w = (t.x1 - t.x0) * B;
        const up = -pz * w; // positivo hacia arriba
        U += up;
        MU += up * (L - (t.x0 + t.x1) / 2); // brazo respecto al borde de sotavento
      }
      const Mo = F * brazoF + MU;
      const Mr = pesoN * L / 2;
      const FSv = Mo > 0 ? Mr / Mo : Infinity;
      const FSd = F > 0 ? (c.mu * Math.max(0, pesoN - U)) / F : Infinity;
      const FSu = U > 0 ? pesoN / U : Infinity;
      // Anclaje (combinación γD·D + γW·W)
      const Tline = Math.max(0, (c.gW * Mo - c.gD * Mr) / L); // tracción en línea de barlovento
      const Tanc = Tline / c.anclajesLado;
      const Vanc = (c.gW * F) / (2 * c.anclajesLado);
      res.push({ dir, B, L, hL, LB, CpLee, pNeta, Aface, F, brazoF, U, MU, Mo, Mr, FSv, FSd, FSu, Tline, Tanc, Vanc, tramos });
    }
    return { H, h, Kh: qH.Kz, qh, pesoN, res };
  }

  /* ================= Techumbre específica (para artefacto de cerchas) ================= */
  /**
   * Devuelve los parámetros q, Cpi, Cp barlovento y Cp sotavento para cada combinación.
   * q entregado = qh·Kd (kPa) y Cp entregado = G·Cp, de modo que p = q·(Cp − Cpi).
   */
  function techumbre(g, t) {
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

  const api = {
    G_ACC, ZONAS, IMPORTANCIA, KD, EXPOSICION, TERRENO, TABLA5, TABLA4, CERRAMIENTO, TOPO,
    lerp, round, Nm2_to_kgf, Kz, Ke, Kzt, qz, clasificarCerramiento, Ri,
    CpSotavento, CpTechoBarlovento, CpTechoSotavento, CpTechoZona, zonasTecho, CpZonaPromedio,
    GCpfA, ENV_A, ENV_B, direccional, galponSAP, trazaCpTecho, redArea, simplificado, contenedor, techumbre,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NCh432 = api;
})(typeof window !== 'undefined' ? window : globalThis);
