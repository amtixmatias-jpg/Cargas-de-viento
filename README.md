# Viento NCh 432

Herramienta web para aplicar la norma chilena de viento **NCh 432 Of2025**, con la misma secuencia de la planilla `CARGAS.xlsx` (hoja VIENTO).

Abrir `index.html` en el navegador (no requiere instalación). El motor de cálculo está en `calc.js`.

## Módulos

| Pestaña | Uso | Formulación |
|---|---|---|
| Galpón | Método direccional (SPRFV). Patrones ±WX ±WY × variantes de Cp de techo × ±GCpi (hasta 16) para SAP 2000, envolvente por superficie, resultantes Fx/Fy/Fz con casos que gobiernan, cargas por marco y traza de la interpolación de Cp | p = qh·Kd·G·Cp − qh·Kd·(GCpi) |
| Edificio bajo | Provisorio: procedimiento de envolvente ASCE 7-22 cap. 28. **No es el Anexo A de la NCh 432:2025** (pendiente) | p = qh·Kd·[(GCpf) − (GCpi)] |
| Contenedor | Contenedor oficina/bodega: fuerza horizontal, succión de techo, volcamiento, deslizamiento y anclajes | γD·D + γW·W |
| Techumbre | Entrega q [kPa], Cpi, Cp barlovento y Cp sotavento para el artefacto de cerchas (p = q·(Cp − Cpi)) | q = qh·Kd, Cp = G·Cp |

Parámetros generales (columna izquierda): zona y V (Tabla 1), I (Tabla 2), Kd (Tabla 3), exposición y Kz (Tabla 5 / Nota 1), Kzt (Fig. 3), Ke (Tabla 4 / Nota 2), G, cerramiento y GCpi (Tabla 7, Ri 5.11.1).

## Notas

- q(z) = 0,613 · I · Kz · Kzt · Ke · V² [N/m²].
- Tabla 6 (α, zg, zmín) no estaba en la planilla. Se usan α = 7,5 / 9,8 / 11,5; zg = 1000 / 750 / 590 m; zmín = 10 / 5 / 2 m (B / C / D), que reproducen la Tabla 5 al redondear. **Verificar contra la norma.**
- La pestaña Edificio bajo usa el procedimiento de envolvente de ASCE 7-22 y no el Anexo A de la NCh. Falta incorporar el Anexo A.
- Para θ ≤ 10° se usa h = altura de alero. Los valores 0,0ᵃ de la tabla de techos solo se usan para interpolar.

## Pruebas

```
node test/calc.test.js
```
