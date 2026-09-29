// Genera dist/Viento-NCh432.html: un solo archivo autocontenido (sin dependencias locales)
// que se abre con doble clic en cualquier navegador, con o sin internet.
// Uso: node build.js
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const calc = fs.readFileSync(path.join(__dirname, 'calc.js'), 'utf8');
const tag = '<script src="calc.js"></script>';
if (!html.includes(tag)) throw new Error('No se encontró la referencia a calc.js en index.html');
const cuerpo = html.replace(tag, () => '<script>\n' + calc.replace(/<\/script/gi, '<\\/script') + '\n</script>');
const out = '<!doctype html>\n<html lang="es">\n' + cuerpo + '\n</html>\n';
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'Viento-NCh432.html'), out);
console.log('dist/Viento-NCh432.html', (out.length / 1024).toFixed(0) + ' KB');
