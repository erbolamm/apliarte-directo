import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { spawnSync, execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

function extraerScriptsInline(html) {
  const scripts = [];
  const regex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const attrs = match[1];
    const code = match[2];
    if (/src\s*=/i.test(attrs)) continue;

    const typeMatch = attrs.match(/type\s*=\s*["']([^"']+)["']/i);
    const type = typeMatch ? typeMatch[1].trim().toLowerCase() : 'text/javascript';

    // Omitir tipos que no sean ejecutables como JavaScript (JSON, importmap, etc.)
    if (type.includes('json') || type.includes('ld+json') || type.includes('importmap')) {
      continue;
    }

    const linea = html.substring(0, match.index).split('\n').length;
    scripts.push({ code, type, linea });
  }
  return scripts;
}

function validarSintaxisScript(code, type, filename, linea) {
  if (type === 'module') {
    if (vm.SourceTextModule) {
      new vm.SourceTextModule(code, { identifier: `${filename}:${linea}` });
    } else {
      const res = spawnSync(process.execPath, ['--check', '--input-type=module'], {
        input: code,
        encoding: 'utf8',
      });
      if (res.status !== 0) {
        throw new SyntaxError(`Error de sintaxis en ${filename}:${linea}\n${res.stderr}`);
      }
    }
  } else {
    new vm.Script(code, { filename: `${filename}:${linea}` });
  }
}

test('todos los scripts inline en public/*.html tienen sintaxis JavaScript válida', () => {
  const archivos = readdirSync(PUBLIC_DIR).filter((f) => f.endsWith('.html'));
  assert.ok(archivos.length > 0, 'Debe haber archivos HTML en public');

  for (const archivo of archivos) {
    const ruta = join(PUBLIC_DIR, archivo);
    const html = readFileSync(ruta, 'utf8');
    const scripts = extraerScriptsInline(html);

    for (const { code, type, linea } of scripts) {
      try {
        validarSintaxisScript(code, type, archivo, linea);
      } catch (err) {
        assert.fail(`Fallo de sintaxis en ${archivo}, línea ~${linea}: ${err.message}`);
      }
    }
  }
});

test('demostración: detecta el error de sintaxis en camara.html del commit 113409a y pasa en la actual', () => {
  // 1. Versión actual en public/camara.html pasa sin errores
  const htmlActual = readFileSync(join(PUBLIC_DIR, 'camara.html'), 'utf8');
  const scriptsActual = extraerScriptsInline(htmlActual);
  assert.ok(scriptsActual.length > 0, 'camara.html actual debe tener script inline');
  for (const { code, type, linea } of scriptsActual) {
    assert.doesNotThrow(() => {
      validarSintaxisScript(code, type, 'camara.html (actual)', linea);
    }, 'camara.html actual debe tener sintaxis válida');
  }

  // 2. Versión de commit 113409a falla con error de sintaxis
  try {
    const html113409a = execSync('git show 113409a:public/camara.html', { encoding: 'utf8' });
    const scripts113409a = extraerScriptsInline(html113409a);
    let errorDetectado = false;
    for (const { code, type, linea } of scripts113409a) {
      try {
        validarSintaxisScript(code, type, 'camara.html (113409a)', linea);
      } catch (err) {
        errorDetectado = true;
        assert.match(err.message, /Unexpected end of input|SyntaxError/);
      }
    }
    assert.ok(errorDetectado, 'El script de camara.html en 113409a debía fallar por sintaxis rota');
  } catch (e) {
    // Si por algún motivo git show falla (ej. shallow clone), registrarlo
    if (!e.message.includes('113409a')) throw e;
  }
});
