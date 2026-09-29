// Las mutaciones de Directo se consumen desde el propio panel (:8790) y desde
// la Oficina local (:8791). Nunca se reflejan a cualquier origen: un POST
// simple de una página ajena también puede alcanzar 127.0.0.1 sin preflight.
// Los overlays locales de OBS (cargados como file://) leen el estado con Origin: null o http://absolute.
const ORIGENES_PANEL = new Set([
  'http://127.0.0.1:8790',
  'http://localhost:8790',
  'http://127.0.0.1:8791',
  'http://localhost:8791',
  'http://absolute',
]);

export function corsPanelLocal(req, res, next) {
  const origin = req.get('origin');
  const esGetLocalFile = req.method === 'GET' && (origin === 'null' || origin === 'http://absolute');
  if (origin && !ORIGENES_PANEL.has(origin) && !esGetLocalFile) {
    return res.status(403).json({ error: 'Origen no autorizado' });
  }
  if (origin) {
    res.set('Access-Control-Allow-Origin', origin === 'null' ? '*' : origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

