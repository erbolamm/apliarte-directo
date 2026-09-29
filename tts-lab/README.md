# Isolated TTS comparison lab

This is **not** connected to `server.js`, OBS, or any Directo route. The Compose port is bound to host loopback only. Do not publish it or use it for real viewers without reviewing the providers' terms and licensing.

## Engines and their licences

| Engine | Licence | Needs Internet | Notes |
| --- | --- | --- | --- |
| Piper (`piper-tts`, package from OHF-Voice/piper1-gpl) | GPL-3.0-or-later | No | Runs fully offline. Ships only inside this separate container, never linked into the MIT-licensed Directo code. |
| eSpeak NG | GPL-3.0-or-later | No | Additional isolated offline option. The [upstream language list](https://github.com/espeak-ng/espeak-ng/blob/master/docs/languages.md) has `es`, `es-419`, `ca`, `eu`, `pt` and `ja`; it does not supply individual Latin-American country accents. The Docker package's actual voices remain untested. |
| Edge TTS (`edge-tts`) | Client code GPL; **online voice service has no verified redistributable licence** | Yes | Kept solely for the earlier private comparison. **Excluded from the approved voice catalog and production proposal** by Javier's 2026-09-29 decision. |

## Distribution policy

**No voice model is shipped with ApliArte Directo.** The repository, Docker images and releases never include voice models. Each install downloads the voices it uses directly from their official source (for example the Piper voices on Hugging Face), so every user obtains them under the source's own terms. This keeps the project free to redistribute and to use commercially without re-licensing third-party models. Credits for attributed voices (CC BY / CC BY-SA) must still be shown wherever those voices are used.

## Piper voices (Spanish)

Licences were read from each voice's `MODEL_CARD` in [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) on 2026-09-29. Re-check them before redistributing.

| Voice | Accent | Licence | Condition |
| --- | --- | --- | --- |
| `es_ES-davefx-medium` (default) | Spain | CC0 | None |
| `es_MX-ald-medium` | Mexico | Unlicense | None |
| `es_MX-claude-high` | Mexico | Apache-2.0 | Keep the licence notice |
| `es_AR-daniela-high` | Argentina | CC BY-SA 4.0 | Credit the author; derivatives under the same licence |

There is no Colombian Piper voice. Edge offers `es-CO-SalomeNeural` and `es-CO-GonzaloNeural`.

The voice names above describe the model cards' **dataset** licences, not a completed model-lineage clearance. Do not redistribute a model until inherited checkpoints and applicable notices have been reviewed. See [`DOCUMENTATION/VOICE-CATALOG.md`](../DOCUMENTATION/VOICE-CATALOG.md) for the candidate-by-candidate evidence and required credits. No model was downloaded or committed for the catalog task.

No model is committed. Download the ones you want into `models/` (each needs its `.onnx` and `.onnx.json`):

```sh
cd tts-lab && mkdir -p models && cd models
B=https://huggingface.co/rhasspy/piper-voices/resolve/main/es
curl -LO $B/es_ES/davefx/medium/es_ES-davefx-medium.onnx
curl -LO $B/es_ES/davefx/medium/es_ES-davefx-medium.onnx.json
curl -LO $B/es_MX/ald/medium/es_MX-ald-medium.onnx
curl -LO $B/es_MX/ald/medium/es_MX-ald-medium.onnx.json
curl -LO $B/es_MX/claude/high/es_MX-claude-high.onnx
curl -LO $B/es_MX/claude/high/es_MX-claude-high.onnx.json
curl -LO $B/es_AR/daniela/high/es_AR-daniela-high.onnx
curl -LO $B/es_AR/daniela/high/es_AR-daniela-high.onnx.json
```

## Run

1. `docker compose up --build` from this directory.
2. Open `http://127.0.0.1:8765/`, pick the engine and the voice, and generate. eSpeak NG works without a model download, but its generic `es-419` is not a Colombian/Chilean/etc. accent.
3. Pitch demonstration (Edge only): keep the same voice and text, generate at 0 Hz and then at +30 Hz. The request always sets `--rate=+0%`, so pitch changes without changing the requested speaking rate. Listen to both samples to judge the result.

The service limits text to 500 characters. Piper pitch is intentionally rejected because the lab cannot change it independently of speed.
The catalog task did not build Docker or test audio in this environment. Claude must build the image and verify installed eSpeak voice identifiers and output before using this lab as evidence.
