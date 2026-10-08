'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { YoutubeLiveChat } = require('../src/youtube-livechat');

test('YoutubeLiveChat.parseVideoId handles various formats', () => {
  assert.equal(YoutubeLiveChat.parseVideoId('ZuWtlv2piac'), 'ZuWtlv2piac');
  assert.equal(YoutubeLiveChat.parseVideoId('https://www.youtube.com/watch?v=ZuWtlv2piac'), 'ZuWtlv2piac');
  assert.equal(YoutubeLiveChat.parseVideoId('https://youtu.be/ZuWtlv2piac?t=10'), 'ZuWtlv2piac');
  assert.equal(YoutubeLiveChat.parseVideoId('https://www.youtube.com/watch?other=1&v=ZuWtlv2piac&more=2'), 'ZuWtlv2piac');
  assert.equal(YoutubeLiveChat.parseVideoId('not-a-valid-id'), null);
  assert.equal(YoutubeLiveChat.parseVideoId(''), null);
  assert.equal(YoutubeLiveChat.parseVideoId(null), null);
});

test('YoutubeLiveChat.parseRunsText correctly joins text runs', () => {
  assert.equal(YoutubeLiveChat.parseRunsText([{ text: 'Hola ' }, { text: 'mundo' }]), 'Hola mundo');
  assert.equal(YoutubeLiveChat.parseRunsText([]), '');
  assert.equal(YoutubeLiveChat.parseRunsText(null), '');
  assert.equal(YoutubeLiveChat.parseRunsText([{ text: null }, { foo: 'bar' }]), '');
});

test('YoutubeLiveChat.parseChatItem extracts message details and owner badge', () => {
  const normalAction = {
    addChatItemAction: {
      item: {
        liveChatTextMessageRenderer: {
          id: 'msg-123',
          authorName: { simpleText: 'Manolito' },
          message: { runs: [{ text: '¡Saludos desde el chat!' }] },
          authorPhoto: {
            thumbnails: [
              { url: 'https://yt3.ggpht.com/small.jpg' },
              { url: 'https://yt3.ggpht.com/large.jpg' }
            ]
          },
          authorBadges: [
            {
              liveChatAuthorBadgeRenderer: {
                tooltip: 'Propietario',
                icon: { iconType: 'OWNER' }
              }
            }
          ]
        }
      }
    }
  };

  const parsed = YoutubeLiveChat.parseChatItem(normalAction);
  assert.ok(parsed);
  assert.equal(parsed.id, 'msg-123');
  assert.equal(parsed.usuario, 'Manolito');
  assert.equal(parsed.texto, '¡Saludos desde el chat!');
  assert.equal(parsed.avatar, 'https://yt3.ggpht.com/large.jpg');
  assert.equal(parsed.isOwner, true);

  const viewerAction = {
    addChatItemAction: {
      item: {
        liveChatTextMessageRenderer: {
          id: 'msg-456',
          authorName: { simpleText: 'Espectador' },
          message: { runs: [{ text: 'hola' }] }
        }
      }
    }
  };
  const parsedViewer = YoutubeLiveChat.parseChatItem(viewerAction);
  assert.equal(parsedViewer.isOwner, false);
  assert.equal(parsedViewer.avatar, null);

  assert.equal(YoutubeLiveChat.parseChatItem({}), null);
  assert.equal(YoutubeLiveChat.parseChatItem(null), null);
});

test('YoutubeLiveChat extracts initial tokens and polls messages with mock fetch', async () => {
  const mockHtmlChannel = `
    <!DOCTYPE html><html><head>
    <link rel="canonical" href="https://www.youtube.com/watch?v=ZuWtlv2piac">
    </head></html>
  `;
  const mockHtmlChat = `
    <!DOCTYPE html><html><body>
    <script>
      ytcfg.set({"INNERTUBE_API_KEY":"AIzaFakeKey123","clientVersion":"2.20261008.01.00"});
      window["ytInitialData"] = {
        "contents": {
          "liveChatRenderer": {
            "continuations": [{
              "timedContinuationData": { "continuation": "init-token-abc" }
            }]
          }
        }
      };
      // continuation: "init-token-abc"
      var continuation = "init-token-abc";
    </script>
    </body></html>
  `;

  const mockGetLiveChat = {
    continuationContents: {
      liveChatContinuation: {
        actions: [
          {
            addChatItemAction: {
              item: {
                liveChatTextMessageRenderer: {
                  id: 'yt-msg-01',
                  authorName: { simpleText: 'Gamer1' },
                  message: { runs: [{ text: '¡Buen directo!' }] },
                  authorPhoto: { thumbnails: [{ url: 'https://cdn.yt/gamer1.png' }] }
                }
              }
            }
          }
        ],
        continuations: [
          {
            timedContinuationData: {
              continuation: 'next-token-def',
              timeoutMs: 5000
            }
          }
        ]
      }
    }
  };

  const requests = [];
  const mockFetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.includes('/@erbolammApliArte/live')) {
      return { ok: true, text: async () => mockHtmlChannel };
    }
    if (url.includes('/live_chat?v=')) {
      return { ok: true, text: async () => mockHtmlChat };
    }
    if (url.includes('/live_chat/get_live_chat')) {
      return { ok: true, json: async () => mockGetLiveChat };
    }
    return { ok: false, status: 404 };
  };

  const chat = new YoutubeLiveChat({
    channel: '@erbolammApliArte',
    fetchFn: mockFetch,
    pollInterval: 100
  });

  const vid = await chat.resolveVideoId();
  assert.equal(vid, 'ZuWtlv2piac');

  const initial = await chat.fetchInitialChat(vid);
  assert.equal(initial.apiKey, 'AIzaFakeKey123');
  assert.equal(initial.continuation, 'init-token-abc');

  const received = [];
  chat.on('chat', msg => received.push(msg));

  chat.running = true;
  await chat.pollChat();

  assert.equal(received.length, 1);
  assert.equal(received[0].usuario, 'Gamer1');
  assert.equal(received[0].texto, '¡Buen directo!');
  assert.equal(received[0].avatar, 'https://cdn.yt/gamer1.png');
  assert.equal(chat.continuation, 'next-token-def');

  // Second poll with same items does not duplicate
  await chat.pollChat();
  assert.equal(received.length, 1);

  chat.stop();
  assert.equal(chat.running, false);
});

test('YoutubeLiveChat.parseChatItem drops the leading at-sign from YouTube handles', () => {
  const item = (name) => YoutubeLiveChat.parseChatItem({
    addChatItemAction: { item: { liveChatTextMessageRenderer: {
      id: 'x1', authorName: { simpleText: name }, message: { runs: [{ text: 'hola' }] },
    } } },
  });
  assert.equal(item('@erbolammApliArte').usuario, 'erbolammApliArte');
  assert.equal(item('Manolito').usuario, 'Manolito');
  assert.equal(item('@').usuario, 'anónimo');
});
