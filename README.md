# Viento NCh 432

Herramienta web para aplicar la norma chilena de viento **NCh 432 Of2025**, con la misma secuencia de la planilla `CARGAS.xlsx` (hoja VIENTO).

Abrir `index.html` en el navegador (no requiere instalación). El motor de cálculo está en `calc.js`.

## Módulos

| Pestaña | Uso | Formulación (NCh 432:2025) |
|---|---|---|
| Galpón | SPRFV por **cap. 6** (direccional) o **Anexo A** (simplificado). Patrones ±WX ±WY para SAP 2000, envolvente por superficie, resultantes Fx/Fy/Fz con casos que gobiernan, torsión de la Fig. 11, carga mínima 6.1.5, cargas por marco y traza de la interpolación de Cp | Ec. (4) p = q·Kd·G·Cp − qi·Kd·(GCpi) · Anexo A pz = p0·Kz·C |
| Edificio bajo | Procedimiento envolvente del **cap. 7** (Fig. 12), casos 1 y 2, zonas 1–6 y E | Ec. (7) p = qh·Kd·[(GCpf) − (GCpi)] |
| Contenedor | Edificio cerrado pequeño por cap. 6 o Anexo A; edificio elevado (6.3.1.1) con fuerza en apoyos; mínimo 6.1.5; volcamiento, deslizamiento y anclajes | γD·D + γW·W |
| Techumbre | q [kPa], Cpi, Cp barlovento y Cp sotavento para el artefacto de cerchas (p = q·(Cp − Cpi)); la cercha es SPRFV (3.29) | cap. 6: q = qh·Kd, Cp = G·Cp · Anexo A: q = p0·Kz, Cp = C, Cpi = 0 |

Parámetros generales (columna izquierda): zona, V y p0 (Tabla 1), I (Tabla 2), Kd (Tabla 3), exposición y Kz (Tablas 5 y 6), Kzt (Fig. 3), Ke (Tabla 4), G (5.9), cerramiento y GCpi (Tabla 7, Ri 5.11.1).

## Notas

- q(z) = 0,613 · I · Kz · Kzt · Ke · V² [N/m²] (Ec. 2). Tablas y coeficientes verificados contra el texto de la NCh 432:2025 (`norma/`).
- Para θ ≤ 10° se usa h = altura de alero (Fig. 4). Los valores 0,0ᵃ solo se usan para interpolar (nota 2 de la Fig. 4).
- Anexo A caso 2 (dos aguas): la Tabla A.1 indica 0,7 para superficies perpendiculares al viento y el esquema de la Fig. A.1 indica +0,60 en el muro frontal; por defecto se usa 0,7 (opción para 0,60).
- El 9.10 de la norma ("Contenedores, silos y tanques circulares") no trata contenedores de oficina.
- Pendiente: componentes y revestimientos (cap. 9) para costaneras y planchas; casos de torsión de la Fig. 13 (cap. 7).

## Pruebas

```
node test/calc.test.js
```
