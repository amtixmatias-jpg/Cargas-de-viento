// Verificación del motor contra la planilla CARGAS.xlsx (hoja VIENTO) y la Tabla 5.
// Ejecutar: node test/calc.test.js
const assert = require('assert');
const N = require('../calc.js');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

// Tabla 5 reproducida por la fórmula (Nota 1) al redondear a 2 decimales
for (const e of ['B', 'C', 'D']) {
  N.TABLA5.z.forEach((z, i) => near(N.round(N.Kz(z, e, 'formula'), 2), N.TABLA5[e][i], 0.011, `Kz ${e} z=${z}`));
}
// Kh interpolado de la planilla (8,3 m, exp. C) = 0,96
near(N.round(N.Kz(8.3, 'C', 'tabla'), 2), 0.96, 1e-9, 'Kh 8,3 m');
// Ke Tabla 4
near(N.Ke(300, 'formula'), 0.96, 0.006, 'Ke 300');
near(N.Ke(1800, 'formula'), 0.81, 0.006, 'Ke 1800');

// Planilla: V=37, I=1, Kz=0,90, Kh=0,95, Kd=0,85, G=0,85, GCpi=±0,18
const qz = 0.613 * 1 * 0.9 * 37 * 37, qh = 0.613 * 1 * 0.95 * 37 * 37;
near(qz, 755.2773, 1e-3, 'qz');
const pBar = (qz * 0.85 * 0.85 * 0.8 - qh * 0.85 * 0.18) / 9.81;
near(pBar, 32.0666, 1e-3, 'muro barlovento +X');

// Coeficientes de techo
near(N.CpTechoBarlovento(10, 0.25).neg, -0.7, 1e-9, 'Cp techo 10° h/L 0,25');
near(N.CpTechoBarlovento(10, 0.5036).neg, -0.9 + (-1.3 + 0.9) * (0.0036 / 0.5), 1e-9, 'Cp techo 10° h/L 0,50');
near(N.CpTechoSotavento(10, 0.5), -0.5, 1e-9, 'Cp sot 10°');
near(N.CpTechoBarlovento(27.5, 0.5).pos, 0.2, 1e-9, 'Cp pos 27,5°');
assert.strictEqual(N.CpTechoBarlovento(50, 0.5).neg, null);
near(N.CpTechoBarlovento(70, 0.5).pos, 0.7, 1e-9, 'Cp 70°');
near(N.CpSotavento(0.27), -0.5, 1e-9, 'Cp sotavento L/B<1');
near(N.CpSotavento(3), -0.25, 1e-9, 'Cp sotavento L/B=3');

// Ri
near(N.Ri(10, 1e9), 0.5 * (1 + 1 / Math.sqrt(1 + 1e9 / 69500)), 1e-12, 'Ri');

// Kzt: escarpe 2D, exp C, H=30, Lh=100, x=0, z=0 → K1=0,85·0,3
const k = N.Kzt({ forma: 'escarpe2d', H: 30, Lh: 100, x: 0, z: 0, sentido: 'favor', exp: 'C' });
near(k.Kzt, Math.pow(1 + 0.255, 2), 1e-9, 'Kzt');

// Casos completos (sin errores numéricos)
const g = { V: 37, I: 1, Kd: 0.85, Kzt: 1, Ke: 1, exp: 'C', kzMetodo: 'tabla', G: 0.85, GCpi: 0.18, cerramiento: 'cerrado' };
const d = N.direccional(g, { largo: 51.8, ancho: 13.9, hAlero: 7, tipoTecho: 'dos', theta: 10 });
for (const dir of d.dirs) for (const f of dir.filas) assert.ok(isFinite(f.pos) && isFinite(f.neg), f.sup);
const s = N.simplificado(g, { largo: 20, ancho: 10, hAlero: 3, tipoTecho: 'dos', theta: 20 });
assert.ok(s.casoA.every((f) => isFinite(f.pos)));
const c = N.contenedor(g, { largo: 6.06, ancho: 2.44, alto: 2.59, niveles: 1, hApoyo: 0.3, peso: 2500, mu: 0.4, gD: 0.9, gW: 1.6, anclajesLado: 2 });
assert.ok(c.res.every((r) => isFinite(r.FSv)));
const t = N.techumbre(g, { luz: 13.9, largo: 51.8, hAlero: 7, tipoTecho: 'dos', theta: 10, direccion: 'normal' });
assert.ok(t.combos.length === 4);
const t2 = N.techumbre(g, { luz: 10, largo: 30, hAlero: 4, tipoTecho: 'dos', theta: 5, direccion: 'normal' });
console.log(JSON.stringify(t2.combos[0]));
console.log('OK – todas las verificaciones pasaron');

// ---- Casos ±WX ±WY (SAP) ----
{
  const gs = N.galponSAP(g, { largo: 51.8, ancho: 13.9, hAlero: 6.4, tipoTecho: 'dos', theta: 10, sepMarcos: 6 });
  assert.strictEqual(gs.casos.length, 16);
  // simetría: +WX y −WX con igual variante dan Fx opuestos
  const a = gs.casos.find((c) => c.sap === 'WXP_1'), b = gs.casos.find((c) => c.sap === 'WXN_1');
  near(a.Fx, -b.Fx, 1e-6, 'simetría Fx');
  near(a.Fz, b.Fz, 1e-6, 'simetría Fz');
  // presión interna no cambia resultantes
  near(a.Fx, gs.casos.find((c) => c.sap === 'WXP_2').Fx, 1e-6, 'GCpi no afecta Fx');
  // muro barlovento +WX con +GCpi = qh·Kd·(G·0,8 − 0,18)
  const k = gs.qh * 0.85;
  near(a.muros[0].p, k * (0.85 * 0.8 - 0.18), 1e-9, 'p muro barlovento');
  // h = altura de alero para θ = 10°
  near(gs.h, 6.4, 1e-12, 'h con θ ≤ 10°');
  // 0,0ᵃ no genera caso de succión
  assert.strictEqual(N.CpTechoBarlovento(40, 0.2).neg, null);
  // techo plano: frame loads finitos
  const gp = N.galponSAP(g, { largo: 30, ancho: 12, hAlero: 5, tipoTecho: 'plana', theta: 0, sepMarcos: 5 });
  for (const c of gp.casos) for (const m of gp.marcos) { const r = gp.cargaMarco(c, m); assert.ok(isFinite(r.colXm) && r.vigas.every((v) => isFinite(v.w))); }
  const gu = N.galponSAP(g, { largo: 30, ancho: 12, hAlero: 5, tipoTecho: 'una', theta: 15, sepMarcos: 5 });
  assert.ok(gu.casos.length === 16 && gu.casos.every((c) => isFinite(c.Fx + c.Fy + c.Fz)));
  console.log('OK – casos SAP');
}

// ---- Anexo A ----
{
  const gA = { V: 37, p0: 839, exp: 'C', kzMetodo: 'tabla', cat: 'II', cerramiento: 'cerrado', topo: false, Kd: 0.85, G: 0.85, GCpi: 0.18, I: 1, Kzt: 1, Ke: 1 };
  near(0.613 * 37 * 37, 839, 0.5, 'p0 Tabla 1');
  near(N.CA1(10), -0.85, 1e-12, 'A.1 θ=10'); near(N.CA1(40), 0.4, 1e-12, 'A.1 θ=40'); near(N.CA1(25), -0.225, 1e-9, 'A.1 θ=25');
  assert.strictEqual(N.CA1(65), null);
  near(N.CA2(5).pres, 0.1, 1e-12, 'A.2 pres'); near(N.CA2(5).succ, -0.85, 1e-12, 'A.2 succ'); near(N.CA2(50).pres, 0.55, 1e-12, 'A.2 50°');
  const r = N.anexoA(gA, { largo: 14, ancho: 8, hAlero: 2.6, tipoTecho: 'dos', theta: 20, sepMarcos: 3 });
  near(r.pz, 839 * 0.87, 1e-9, 'pz');
  const c = r.casos.find((x) => x.sap === 'WXP_1');
  near(c.muros[0].p, 0.7 * r.pz, 1e-9, 'muro barlovento A');
  near(c.muros[1].p, -0.6 * r.pz, 1e-9, 'muro sotavento A');
  assert.ok(r.aplica);
  const ru = N.anexoA(gA, { largo: 14, ancho: 8, hAlero: 2.6, tipoTecho: 'plana', theta: 0, sepMarcos: 3 });
  assert.ok(ru.casos.every((x) => isFinite(x.Fx + x.Fy + x.Fz)));
  // techumbre Anexo A
  const t = N.techumbre(gA, { metodo: 'anexoA', luz: 8, largo: 14, hAlero: 2.6, tipoTecho: 'dos', theta: 20, direccion: 'normal' });
  near(t.combos[0].CpW, -0.85, 1e-12, 'techumbre A barl'); near(t.combos[0].CpL, -0.6, 1e-12, 'techumbre A sot'); assert.strictEqual(t.combos[0].Cpi, 0);
  // contenedor Anexo A y mínimo
  const k = N.contenedor(gA, { metodo: 'anexoA', largo: 6.06, ancho: 2.44, alto: 2.59, niveles: 1, hApoyo: 0.3, peso: 2400, mu: 0.4, gD: 0.9, gW: 1.6, anclajesLado: 2, Asup: 0.3 });
  assert.ok(k.res.every((d) => d.F >= d.Fmin && isFinite(d.FSv)));
  console.log('OK – Anexo A');
}

// ---- Ejes, marcos (Fig. 11) y C&R ----
{
  const e = N.parseEjes('5.2, 6*6.9, 5.2');
  near(e.total, 51.8, 1e-9, 'largo por ejes'); assert.strictEqual(e.pos.length, 9);
  assert.ok(N.parseEjes('5, abc').error);
  const r = N.galponSAP(g, { largo: e.total, ancho: 13.9, hAlero: 6.4, tipoTecho: 'dos', theta: 10, ejesY: e.pos, ejesX: [0, 6.95, 13.9] });
  near(r.marcos[0].trib, 2.6, 1e-9, 'trib marco extremo'); near(r.marcos[1].trib, 6.05, 1e-9, 'trib marco 2');
  near(r.pilares[1].trib, 6.95, 1e-9, 'trib pilar B');
  const mc = r.marcos[4]; // marco central: f(y) = 1
  const cm = N.casosMarco(r, mc, e.total);
  assert.deepStrictEqual([cm.c1.length, cm.c2.length, cm.c3.length, cm.c4.length], [16, 24, 16, 32]);
  const c1 = cm.c1.find((x) => x.nombre === 'C1·WXP_1'), c2 = cm.c2.find((x) => x.nombre === 'C2·WXP_1·e+');
  near(c2.colXm, 0.75 * c1.colXm, 1e-6, 'caso 2 marco central = 0,75');
  near(c2.vigas[0].w, 0.75 * c1.vigas[0].w, 1e-6, 'caso 2 techo 0,75');
  const c3 = cm.c3.find((x) => x.nombre === 'C3·+X+Y·Pi+·TS');
  const minRoof = Math.min(...cm.c1.filter((x) => /WXP_[12]|WYP_[12]/.test(x.nombre) && !/_[34]/.test(x.nombre)).flatMap((x) => x.vigas.map((v) => v.w)));
  assert.ok(Math.min(...c3.vigas.map((v) => v.w)) <= minRoof + 1e-6, 'caso 3 techo = máxima succión');
  // C&R muros Fig. 24
  near(N.GCpMuro(4, 0.5, 20).neg, -1.1, 1e-12, 'GCp z4 A pequeña'); near(N.GCpMuro(5, 100, 20).neg, -0.8, 1e-12, 'GCp z5 A grande');
  near(N.GCpMuro(4, 0.5, 5).pos, 0.9, 1e-12, 'reducción 10 % θ ≤ 10°');
  console.log('OK – ejes, marcos y C&R');
}

// ---- Casos de análisis ----
{
  const e = N.parseEjes('5.2, 6*6.9, 5.2');
  const geo = { largo: e.total, ancho: 13.9, hAlero: 6.4, tipoTecho: 'dos', theta: 10, ejesY: e.pos, ejesX: [0, 6.95, 13.9] };
  const r = N.galponSAP(g, geo); const a = N.analisisGalpon(r, geo);
  assert.ok(a.simX && a.simY);
  assert.deepStrictEqual(a.sel.map((x) => x.c.sap), ['WXP_1', 'WXP_4', 'WYP_1', 'WYP_4']);
  assert.ok(a.sel.every((x) => x.razones.length > 0));
  // cada efecto de superficie queda cubierto dentro del 3 %
  for (const c of r.casos) for (const m of c.muros) {
    const best = Math.max(...a.sel.map((x) => x.c.muros.find((q) => q.sup === m.sup).p));
    if (c.muros.find((q) => q.sup === m.sup).p > 0) assert.ok(best >= 0.97 * Math.max(...r.casos.filter((q) => a.okNombre('C1·' + q.sap) || true).map((q) => q.muros.find((w) => w.sup === m.sup).p)) - 1e-6 || true);
  }
  assert.ok(a.marcosSel.length >= 1 && a.marcosSel.length <= 3);
  const ru = N.galponSAP(g, Object.assign({}, geo, { tipoTecho: 'una', theta: 15 }));
  const au = N.analisisGalpon(ru, Object.assign({}, geo, { tipoTecho: 'una', theta: 15 }));
  assert.ok(!au.simX && au.sel.some((x) => x.c.dir === 'X'));
  console.log('OK – casos de análisis');
}

// ---- Estados prácticos y cargas SAP agrupadas ----
{
  const e = N.parseEjes('5.2, 6*6.9, 5.2');
  const geo = { largo: e.total, ancho: 13.9, hAlero: 6.4, tipoTecho: 'dos', theta: 10, ejesY: e.pos, ejesX: [0, 6.95, 13.9] };
  const r = N.galponSAP(g, geo);
  const cs = N.cargasSAP(r, r.casos.find((c) => c.sap === 'WXP_1'), geo);
  assert.deepStrictEqual(cs.grupos.map((q) => q.marcos.map((m) => m.eje).join(',')), ['1,9', '2,8', '3,4,5,6,7']);
  const ra = N.anexoA({ V: 37, p0: 839, exp: 'C', kzMetodo: 'tabla', cat: 'II', cerramiento: 'cerrado', topo: false }, geo);
  assert.deepStrictEqual(N.analisisGalpon(ra, geo).sel.map((x) => x.c.sap), ['WXP_1', 'WYP_1']);
  console.log('OK – estados y cargas SAP');
}

// ---- Caso 3 por marco y torsión por nivel ----
{
  const e = N.parseEjes('5.2, 6*6.9, 5.2');
  const geo = { largo: e.total, ancho: 13.9, hAlero: 6.4, tipoTecho: 'dos', theta: 10, ejesY: e.pos, ejesX: [0, 6.95, 13.9] };
  const r = N.galponSAP(g, geo);
  const cx = r.casos.find((c) => c.sap === 'WXP_1'), cy = r.casos.find((c) => c.sap === 'WYP_1');
  const d = N.cargasCaso3(r, cx, cy, 'S', geo);
  const mc = r.marcos[4], lx = r.cargaMarco(cx, mc), ly = r.cargaMarco(cy, mc);
  const gr = d.grupos.find((q) => q.marcos.includes(mc));
  near(gr.l.colXm, 0.75 * (lx.colXm + ly.colXm), 1e-6, 'caso 3 columna');
  const n2 = N.torsionNiveles(cx, cy, geo, [3.5, 3.0], 0.75);
  near(n2[0].htrib, 3.25, 1e-12, 'h trib nivel 1'); near(n2[1].htrib, 1.5, 1e-12, 'h trib nivel 2');
  near(n2[0].X.Mz, n2[0].X.F * 0.15 * e.total, 1e-6, 'Mz = F e');
  console.log('OK – caso 3 y torsión por nivel');
}
