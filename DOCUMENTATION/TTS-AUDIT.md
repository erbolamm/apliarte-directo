# Directo TTS audit — 2026-09-29

## What runs today (source audit, not a VPS test)

`server.js` and `vps-overlay/server.js` expose `GET /api/tts`. Both trim the text to 160 characters, default `tl` to `es`, then proxy `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=…&q=…`. The handler has **no authentication, local request-rate limiter, retry/backoff, or cache lookup** (its response only sets a one-day cache header). It forwards non-2xx upstream status and returns 500 for fetch errors. No real VPS request was made for this audit. This is the Google **Translate web TTS endpoint**, not the authenticated Google Cloud Text-to-Speech API.

`public/plano.html` requests `/api/tts` for avatar speech. It truncates text to 140 characters, maintains a maximum eight-item queue with duplicate suppression, and uses `audio.preservesPitch = false` plus `playbackRate` to alter pitch. Thus the current pitch **also changes duration/speed**. `public/index.html` has a similar avatar queue. Separately, `public/tts-twitch.html` and `public/admin.html` use browser `SpeechSynthesisUtterance` and set `.pitch` independently of `.rate`; actual installed voices depend on the browser/OS. `voces-blogger.html` is a copy-command widget, not a voice catalog or synthesis engine. It offers `!speak -config` for `es-ES`, `es-MX`, `es-AR`, `es-CO` (and more), with two slots per locale. A command being offered does **not** prove two distinct Google voices exist for that locale.

## Spanish locale variants

| Locale | Current Directo behavior | What is verified |
| --- | --- | --- |
| `es-ES` | Forwarded verbatim to Translate web TTS; browser TTS looks for matching installed voices. | The [Google Cloud voice catalog](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types) lists `es-ES` Cloud voices. This does not establish behavior of the separate Translate endpoint. |
| `es-MX` | Forwarded verbatim; fallback in browser TTS depends on local voice list. | Blogger command exists. No distinct Translate-web voice or Cloud catalog entry was verified. |
| `es-AR` | Same. | Blogger command exists. No distinct Translate-web voice or Cloud catalog entry was verified. |
| `es-CO` | Same. | Blogger command exists. No distinct Translate-web voice or Cloud catalog entry was verified. |

Do not label any of the four as an authentic regional accent until audio samples from the **actual production path** are captured and compared by listening. The Google Cloud catalog and the Translate-web endpoint are different products and must not be conflated.

## Request limits and risk

The Translate-web `client=tw-ob` endpoint used by Directo does not provide a documented project quota in the sources checked. Therefore its exact requests/minute limit is **unknown**, may vary, and cannot be inferred from successful local calls or Google Cloud quotas. We did not make rate-probing requests from the VPS. The absence of an application-side limit means many simultaneous `/api/tts` calls can hit upstream throttling; the browser queue limits one client only.

For comparison **only**, the separate [Google Cloud TTS quotas page](https://docs.cloud.google.com/text-to-speech/quotas) currently states 5,000 input bytes/request and 1,000 requests/minute/project for voices without a dedicated quota (e.g. Neural2 1,000, Chirp3 200, Studio 500). These numbers **do not apply** to Directo's Translate-web proxy. A supported Cloud migration would require explicit credentials, cost review, per-project quota checks and Javier's approval; none was attempted.

## Isolated comparison lab

`tts-lab/` offers a loopback-only Docker comparison of [edge-tts](https://github.com/rany2/edge-tts) and [Piper](https://github.com/OHF-Voice/piper1-gpl). Edge can send `--pitch=+30Hz` while holding `--rate=+0%`; its upstream README documents separate pitch and rate options and notes arbitrary custom SSML is unsupported. Piper is local but requires a separately obtained model; its current lab path rejects nonzero pitch instead of silently changing speed. This is an **implementation proof of concept**, not evidence of audible quality, service availability, permitted production use, or a Docker image build. Neither engine is wired into `server.js`.

## Verification still needed

1. Build and start the Docker lab, install a licensed Spanish Piper model, and generate/listen to both engines.
2. Compare actual `es-ES`, `es-MX`, `es-AR`, `es-CO` output from the authorized Directo environment without publishing sample text or secrets.
3. If an engine is considered for production, review its service terms, voice/model licenses, costs, request limits and error behavior, then design a protected, rate-limited integration separately.
