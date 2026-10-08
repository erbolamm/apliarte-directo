'use strict';

const EventEmitter = require('node:events');

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

class YoutubeLiveChat extends EventEmitter {
  constructor(options = {}) {
    super();
    this.channel = options.channel || '@erbolammApliArte';
    this.videoId = options.videoId || null;
    this.pollInterval = options.pollInterval || 3000;
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
    this.running = false;
    this.timer = null;
    this.apiKey = null;
    this.clientVersion = null;
    this.continuation = null;
    this.processedIds = new Set();
  }

  static parseVideoId(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  static parseRunsText(runs) {
    if (!Array.isArray(runs)) return '';
    return runs.map(r => (r && r.text ? r.text : '')).join('');
  }

  static parseChatItem(action) {
    if (!action || typeof action !== 'object') return null;
    const renderer = action.addChatItemAction?.item?.liveChatTextMessageRenderer ||
                     action.addChatItemAction?.item?.liveChatPaidMessageRenderer;
    if (!renderer || !renderer.id) return null;

    const id = String(renderer.id);
    const usuario = renderer.authorName?.simpleText || 'anónimo';
    const texto = YoutubeLiveChat.parseRunsText(renderer.message?.runs);
    const avatar = renderer.authorPhoto?.thumbnails?.slice(-1)[0]?.url || null;
    const isOwner = Boolean(
      renderer.authorBadges?.some(b => {
        const badge = b.liveChatAuthorBadgeRenderer;
        return badge && (
          badge.tooltip === 'Propietario' ||
          badge.tooltip === 'Owner' ||
          badge.icon?.iconType === 'OWNER'
        );
      })
    );

    return { id, usuario, texto, avatar, isOwner, timestamp: Date.now() };
  }

  async resolveVideoId() {
    if (this.videoId && /^[a-zA-Z0-9_-]{11}$/.test(this.videoId)) {
      return this.videoId;
    }
    const target = this.channel.startsWith('@') ? this.channel : `@${this.channel}`;
    const url = `https://www.youtube.com/${target}/live`;

    const res = await this.fetchFn(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} resolviendo canal live`);
    const html = await res.text();
    const vidMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})">/) ||
                     html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (!vidMatch) throw new Error('No se encontró emisión en directo para este canal');
    this.videoId = vidMatch[1];
    return this.videoId;
  }

  async fetchInitialChat(videoId) {
    const url = `https://www.youtube.com/live_chat?v=${encodeURIComponent(videoId)}`;
    const res = await this.fetchFn(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} al cargar live_chat`);
    const html = await res.text();

    const keyMatch = html.match(/['"]INNERTUBE_API_KEY['"]:\s*['"](.+?)['"]/);
    if (!keyMatch) throw new Error('INNERTUBE_API_KEY no encontrada');
    this.apiKey = keyMatch[1];

    const verMatch = html.match(/['"]clientVersion['"]:\s*['"]([\d.]+?)['"]/);
    this.clientVersion = verMatch ? verMatch[1] : '2.20240101.00.00';

    const contMatch = html.match(/['"]continuation['"]:\s*['"]([a-zA-Z0-9_-]+)['"]/);
    if (!contMatch) throw new Error('Token continuation no encontrado (¿chat inhabilitado o stream finalizado?)');
    this.continuation = contMatch[1];

    return {
      apiKey: this.apiKey,
      clientVersion: this.clientVersion,
      continuation: this.continuation
    };
  }

  async pollChat() {
    if (!this.running || !this.continuation || !this.apiKey) return;

    try {
      const url = `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${encodeURIComponent(this.apiKey)}`;
      const res = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': this.userAgent
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: this.clientVersion || '2.20240101.00.00'
            }
          },
          continuation: this.continuation
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status} en get_live_chat`);
      const data = await res.json();

      const liveCont = data?.continuationContents?.liveChatContinuation;
      const actions = liveCont?.actions || [];

      for (const act of actions) {
        const item = YoutubeLiveChat.parseChatItem(act);
        if (item && !this.processedIds.has(item.id)) {
          this.processedIds.add(item.id);
          if (this.processedIds.size > 2000) {
            const first = this.processedIds.values().next().value;
            this.processedIds.delete(first);
          }
          this.emit('chat', item);
        }
      }

      const nextContData = liveCont?.continuations?.[0]?.timedContinuationData ||
                           liveCont?.continuations?.[0]?.invalidationContinuationData;
      if (nextContData && nextContData.continuation) {
        this.continuation = nextContData.continuation;
        const delay = Math.max(1000, Number(nextContData.timeoutMs) || this.pollInterval);
        if (this.running) {
          this.timer = setTimeout(() => this.pollChat(), delay);
        }
      } else {
        // Stream may have ended or chat was closed
        this.emit('end', 'No more continuations');
        this.stop();
      }
    } catch (err) {
      this.emit('error', err);
      if (this.running) {
        this.timer = setTimeout(() => this.pollChat(), 10000);
      }
    }
  }

  async start() {
    if (this.running) return;
    this.running = true;
    try {
      const vid = await this.resolveVideoId();
      await this.fetchInitialChat(vid);
      this.emit('start', vid);
      this.pollChat();
    } catch (err) {
      this.emit('error', err);
      if (this.running) {
        // Retry resolving in 30 seconds
        this.timer = setTimeout(() => {
          if (this.running) {
            this.running = false;
            this.start();
          }
        }, 30000);
      }
    }
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.continuation = null;
    this.emit('stop');
  }
}

module.exports = { YoutubeLiveChat };
