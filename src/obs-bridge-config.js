export function bridgeOptions(env = process.env) {
  const port = Number(env.PORT || 7979);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local overlay port');
  const url = env.OBS_BRIDGE_WS_URL || `ws://127.0.0.1:${port}/ws`;
  if (String(env.OBS_BRIDGE || '').toLowerCase() === 'off') return { enabled: false, url };
  const parsed = new URL(url);
  if (!['ws:', 'wss:'].includes(parsed.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname))
    throw new Error('OBS bridge URL must use a local loopback server');
  return { enabled: true, url };
}
