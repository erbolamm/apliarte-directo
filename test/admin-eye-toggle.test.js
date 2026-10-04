import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const REQUIRED_TARGETS = [
  'input-twitch-token',
  'cfg-vdo-pass',
  'cfg-twitch-token',
  'cfg-stream-pass',
  'cfg-stream-key',
  'cfg-youtube-stream-key',
  'cfg-openai-key'
];

const ADMIN_FILES = [
  path.join(rootDir, 'public', 'admin.html'),
  path.join(rootDir, 'vps-overlay', 'public', 'admin.html')
];

for (const filePath of ADMIN_FILES) {
  const relPath = path.relative(rootDir, filePath);

  test(`${relPath} incluye botones de ojo y soporte para revelar/ocultar contraseñas`, () => {
    assert.ok(fs.existsSync(filePath), `Archivo no encontrado: ${filePath}`);
    const html = fs.readFileSync(filePath, 'utf8');

    // Estilos requeridos
    assert.ok(html.includes('.pwd-field-wrap'), `${relPath} debe definir clase .pwd-field-wrap`);
    assert.ok(html.includes('.btn-toggle-eye'), `${relPath} debe definir clase .btn-toggle-eye`);

    // Cada campo de clave requerido debe existir con type="password" y tener su botón asociado
    for (const targetId of REQUIRED_TARGETS) {
      const inputPattern = new RegExp(`id=["']${targetId}["'][^>]*type=["']password["']|type=["']password["'][^>]*id=["']${targetId}["']`);
      assert.ok(
        inputPattern.test(html),
        `${relPath} debe incluir input password con id="${targetId}"`
      );

      const btnPattern = new RegExp(`class=["'][^"']*btn-toggle-eye[^"']*["'][^>]*data-target=["']${targetId}["']|data-target=["']${targetId}["'][^>]*class=["'][^"']*btn-toggle-eye[^"']*["']`);
      assert.ok(
        btnPattern.test(html),
        `${relPath} debe incluir botón .btn-toggle-eye con data-target="${targetId}"`
      );
    }

    // Lógica de script de alternancia
    assert.ok(
      html.includes("document.querySelectorAll('.btn-toggle-eye')"),
      `${relPath} debe registrar el evento de alternancia para los botones de ojo`
    );
    assert.ok(
      html.includes("input.type = isPassword ? 'text' : 'password'"),
      `${relPath} debe alternar el atributo type entre text y password`
    );
  });
}
