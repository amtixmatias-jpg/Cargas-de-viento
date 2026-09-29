# Viento NCh 432

Herramienta web para aplicar la norma chilena de viento **NCh 432 Of2025**, con la misma secuencia de la planilla `CARGAS.xlsx` (hoja VIENTO).

## Uso portable

**`dist/Viento-NCh432.html`** es un solo archivo con todo incluido: se copia a cualquier computador (pendrive, correo, OneDrive) y se abre con doble clic en Chrome, Edge o Firefox, con o sin internet (sin internet usa fuentes del sistema).

- **Guardar proyecto** descarga un `.json` con todos los datos; **Abrir proyecto** lo vuelve a cargar en cualquier computador.
- El navegador además recuerda los últimos datos usados en ese equipo.
- Para regenerar el archivo después de modificar el código: `node build.js`.

Para desarrollo: `index.html` + `calc.js` (motor de cálculo).

## Módulos

| Pestaña | Uso | Formulación (NCh 432:2025) |
|---|---|---|
| Galpón | SPRFV por **cap. 6** o **Anexo A**. Ejes con separaciones libres (marcos 1, 2… y ejes A, B…), planta, presiones por caso en planta y elevación, patrones ±WX ±WY para SAP 2000, envolvente, resultantes, cargas por marco en los 4 casos de la Fig. 11 (con torsión por bloque de presión equivalente), pilares de frontón, carga mínima 6.1.5 y traza de la interpolación de Cp | Ec. (4) p = q·Kd·G·Cp − qi·Kd·(GCpi) · Anexo A pz = p0·Kz·C |
| Edificio bajo | **Anexo A** (por defecto) o **cap. 7** envolvente; figuras por caso; tabiquería perimetral como componentes y revestimientos (cap. 9, Fig. 24): p, carga lineal en pie derecho, momento, reacción y carga en solera | Anexo A pz = p0·Kz·C · Ec. (7) · Ec. (19) p = qh·Kd·[(GCp) − (GCpi)] |
| Contenedor | Contenedores apilados (l × b × h, niveles, apoyos): presiones en los costados por nivel, figura; cap. 6 o Anexo A; edificio elevado (6.3.1.1); mínimo 6.1.5; estabilidad y anclajes como verificación complementaria | γD·D + γW·W |
| Techumbre | q [kPa], Cpi, Cp barlovento y Cp sotavento para el artefacto de cerchas (p = q·(Cp − Cpi)); la cercha es SPRFV (3.29) | cap. 6: q = qh·Kd, Cp = G·Cp · Anexo A: q = p0·Kz, Cp = C, Cpi = 0 |

Parámetros generales (columna izquierda): zona, V y p0 (Tabla 1), I (Tabla 2), Kd (Tabla 3), exposición y Kz (Tablas 5 y 6), Kzt (Fig. 3), Ke (Tabla 4), G (5.9), cerramiento y GCpi (Tabla 7, Ri 5.11.1).

## Notas

- q(z) = 0,613 · I · Kz · Kzt · Ke · V² [N/m²] (Ec. 2). Tablas y coeficientes verificados contra el texto de la NCh 432:2025 (`norma/`).
- Para θ ≤ 10° se usa h = altura de alero (Fig. 4). Los valores 0,0ᵃ solo se usan para interpolar (nota 2 de la Fig. 4).
- Anexo A caso 2 (dos aguas): la Tabla A.1 indica 0,7 para superficies perpendiculares al viento y el esquema de la Fig. A.1 indica +0,60 en el muro frontal; por defecto se usa 0,7 (opción para 0,60).
- El 9.10 de la norma ("Contenedores, silos y tanques circulares") no trata contenedores de oficina.
- Galpón, casos de análisis: se descartan los sentidos espejo (techo simétrico, vanos simétricos) y se conserva el conjunto mínimo de patrones que cubre, con 3 % de tolerancia, el efecto más desfavorable de cada superficie, de Fx, Fy, Fz y de cada elemento de los marcos. Igual para los marcos a modelar. El detalle completo queda plegado.
- Fig. 11: caso 2 techo al 75 % del caso 1; caso 3 techo 100 % del mayor del caso 1; caso 4 techo 100 % del mayor del caso 2. Los factores se aplican a la presión de diseño p (incluye GCpi).
- Pendiente: C&R de techo (costaneras y planchas, Figs. 26 a 36); casos de torsión de la Fig. 13 (cap. 7).

## Pruebas

```
node test/calc.test.js
```
