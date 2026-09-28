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
