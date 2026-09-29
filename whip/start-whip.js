/**
 * ApliArte WHIP Publisher
 * Abre VDO.ninja mixer en Chromium headless y activa "Publish to Twitch"
 * automáticamente via Puppeteer + CDP.
 *
 * Variables de entorno:
 * Credentials come from /app/data/config.json (panel) or environment.
 * An unconfigured clone keeps its control API alive, but cannot stream.
 */

const puppeteer = require('puppeteer-core');
const { loadWhipConfig } = require('./runtime-config');

// Señales para cierre limpio
let browser;
let isStarting = false;

async function shutdown() {
  console.log('[...] Cerrando navegador...');
  if (browser) await browser.close().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

async function startStream() {
  if (browser && browser.connected) {
    console.log('[WHIP] Navegador ya está conectado y emitiendo.');
    return true;
  }
  if (isStarting) return false;
  const config = loadWhipConfig();
  if (!config) {
    console.warn('[WHIP] Credentials incomplete; configure stream key, VDO room and password before starting.');
    return false;
  }
  isStarting = true;

  try {
    const mixerUrl = 'https://vdo.ninja/mixer' +
      `?room=${encodeURIComponent(config.room)}` +
      `&password=${encodeURIComponent(config.password)}` +
      '&whippush=twitch' +
      `&whippushtoken=${encodeURIComponent(config.streamKey)}` +
      '&cleanoutput';
    console.log('=== ApliArte WHIP Publisher ===');
    console.log(`[>>>] URL mixer cargando...`);

    browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        // WebRTC funcional en headless
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
        // Forzar GPU software (sin GPU real en VPS)
        '--use-gl=swiftshader',
        '--enable-unsafe-swiftshader',
        '--disable-gpu',
        // Sin popups ni diálogos
        '--disable-infobars',
        '--disable-extensions',
        '--no-default-browser-check',
        '--no-first-run',
        // Permitir WebRTC (STUN/TURN)
        '--disable-features=WebRtcHWDecoding',
      ],
    });

    const page = await browser.newPage();

    // Browser messages and failed URLs may contain the stream key: never log them.
    page.on('console', msg => {
      if (msg.type() === 'error') console.error('[VDO ERR] Browser console error');
    });
    page.on('pageerror', () => console.error('[PAGE ERR] Browser page error'));
    page.on('requestfailed', req => {
      if (!req.url().includes('favicon') && !req.url().includes('analytics')) {
        console.warn('[REQ FAIL] Browser request failed');
      }
    });

    // Viewport que simula pantalla de mixer
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('[>>>] Navegando al mixer...');
    try {
      await page.goto(mixerUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (e) {
      console.error('[ERR] Error cargando mixer:', e.message);
      await shutdown();
      isStarting = false;
      return false;
    }

    console.log('[OK] Página cargada. Esperando inicialización del mixer (15s)...');
    await delay(15000);

    // --- Intento 1: Clicar botón por texto/selector conocido ---
    const publicado = await intentarPublicar(page);

    if (publicado) {
      console.log('[OK] ¡Stream WHIP activo hacia Twitch!');
    } else {
      console.warn('[WARN] No se pudo activar auto-publish. Intentando via JS...');
      await intentarPublicarViaJS(page);
    }

    console.log('[OK] Streamer activo y emitiendo.');
    isStarting = false;
    return true;
  } catch (err) {
    console.error('[ERR] Excepción durante el arranque del stream:', err.message);
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
    isStarting = false;
    return false;
  }
}

async function stopStream() {
  console.log('[WHIP] Petición de detención del stream recibida...');
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
  return true;
}

// Heartbeat para supervisión periódica
setInterval(() => {
  if (browser && browser.connected) {
    console.log('[ALIVE] Streamer WHIP en marcha...');
  }
}, 30000);

// API interna de control HTTP
const http = require('http');
const CONTROL_PORT = parseInt(process.env.CONTROL_PORT || '3000', 10);

const controlServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  res.setHeader('Content-Type', 'application/json');

  if (url.pathname === '/status' && req.method === 'GET') {
    const streaming = !!(browser && browser.connected);
    return res.end(JSON.stringify({ ok: true, streaming }));
  }

  if (url.pathname === '/start' && req.method === 'POST') {
    const success = await startStream();
    return res.end(JSON.stringify({ ok: success, streaming: success }));
  }

  if (url.pathname === '/stop' && req.method === 'POST') {
    await stopStream();
    return res.end(JSON.stringify({ ok: true, streaming: false }));
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Endpoint no encontrado' }));
});

controlServer.listen(CONTROL_PORT, () => {
  console.log(`[WHIP CONTROL] API HTTP interna de control activa en puerto ${CONTROL_PORT}`);
});

// Autoarranque si no se desactiva explícitamente por variable de entorno
if (process.env.AUTO_START !== 'false') {
  startStream();
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Intenta clicar el botón "Publish to Twitch" / "GO LIVE" en el mixer.
 * Prueba múltiples selectores por si VDO.ninja cambia su HTML.
 */
async function intentarPublicar(page) {
  const selectores = [
    // Selectores del botón del mixer VDO.ninja (por ID, texto o atributo)
    '#startPublishingButton',
    'button[title*="Publish"]',
    'button[title*="publish"]',
    'button[title*="Twitch"]',
    '[id*="publish"][id*="button" i]',
    '[id*="whip"][id*="start" i]',
  ];

  for (const sel of selectores) {
    try {
      const el = await page.$(sel);
      if (el) {
        const visible = await el.isVisible();
        if (visible) {
          await el.click();
          console.log(`[OK] Clicado: ${sel}`);
          await delay(3000);
          // Si hay segundo paso (diálogo de confirmación)
          await confirmarSiExiste(page);
          return true;
        }
      }
    } catch (_) { /* continuar */ }
  }

  // Buscar por texto interno del botón
  try {
    const [btn] = await page.$x('//button[contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "publish") or contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "twitch")]');
    if (btn) {
      await btn.click();
      console.log('[OK] Clicado via XPath texto "publish/twitch"');
      await delay(3000);
      await confirmarSiExiste(page);
      return true;
    }
  } catch (_) { /* continuar */ }

  return false;
}

/**
 * Si hay un diálogo de confirmación tras clicar "Publish to Twitch",
 * intenta confirmar con "Start", "Go Live", "Confirm", etc.
 */
async function confirmarSiExiste(page) {
  const confirmSelectores = [
    'button[id*="startPublish" i]',
    'button[id*="goLive" i]',
    'button[id*="confirm" i]',
    'button[id*="start" i]:not([id*="stop" i])',
  ];
  for (const sel of confirmSelectores) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        await el.click();
        console.log(`[OK] Confirmación clicada: ${sel}`);
        return;
      }
    } catch (_) { /* continuar */ }
  }
}

/**
 * Fallback: inyectar JS directamente para activar el WHIP push.
 * VDO.ninja expone objetos globales que podemos llamar directamente.
 */
async function intentarPublicarViaJS(page) {
  try {
    const result = await page.evaluate(() => {
      // Intentar acceder a la sesión de VDO.ninja
      const fns = [
        // Posibles entradas en el objeto global de VDO.ninja
        () => window?.session?.startWhipPush?.(),
        () => window?.session?.publishWhip?.(),
        () => window?.startPublishing?.(),
        () => {
          // Último recurso: simular click en cualquier botón visible con "twitch" o "publish"
          const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
          const btn = btns.find(b => {
            const t = (b.textContent + b.title + b.id).toLowerCase();
            return t.includes('twitch') || t.includes('publish') || t.includes('go live');
          });
          if (btn) { btn.click(); return `clicked: ${btn.id || btn.textContent.trim()}`; }
          return null;
        },
      ];
      for (const fn of fns) {
        try {
          const r = fn();
          if (r !== undefined) return String(r ?? 'ok');
        } catch (_) {}
      }
      return 'no_method_found';
    });

    console.log('[JS] Resultado inyección:', result);
    if (result !== 'no_method_found') {
      console.log('[OK] Stream activado via JS injection');
    } else {
      console.error('[ERR] No se encontró método de auto-publish. Revisar selectores.');
      console.error('[INFO] Inspect publisher controls manually; page content is not logged.');
    }
  } catch (e) {
    console.error('[ERR] Error en JS injection:', e.message);
  }
}
