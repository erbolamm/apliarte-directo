# Free-licence voice catalog — proposal, not a live Directo feature

Checked **2026-09-29**. Javier's filter: free of charge, with a formal licence permitting commercial use and redistribution. PD, CC0, Unlicense, MIT, Apache-2.0, BSD, CC BY and CC BY-SA are candidates; NC/ND, paid Cloud voices, Edge TTS and Google Translate-web TTS are excluded. GPL engines must remain separate services. **None of these mappings is wired into the current Directo server or Blogger commands.** A source licence is not an end-to-end clearance: inherited checkpoints, training data, model terms and dependencies need a final review before distributing models.

`unknown` means the cited source does not state gender. Do not interpret a model name, slot number, or pitch change as proof of gender. A fallback marked `es` is **generic Spanish**, not the regional accent requested. Slot 1/2 are distinct proposed voices when possible; the present page's high/low pitch effect is separate from speaker identity.

## Distribution policy

**No voice model is shipped with ApliArte Directo.** The repository, Docker images and releases never include voice models. Each install downloads the voices it uses directly from their official source (for example the Piper voices on Hugging Face), so every user obtains them under the source's own terms. This keeps the project free to redistribute and to use commercially without re-licensing third-party models. Credits for attributed voices (CC BY / CC BY-SA) must still be shown wherever those voices are used.

## Proposed page mapping (one row per existing locale)

| Locale | Slot 1 proposal | Slot 2 proposal | Honest coverage |
| --- | --- | --- | --- |
| es-ES | P1 `es_ES-davefx-medium` | P2 `es_ES-carlfm-x_low` | Native Spanish (Spain); gender unknown in both cards. |
| es-MX | P3 `es_MX-ald-medium` | P4 `es_MX-claude-high` | Native Mexican Spanish; gender unknown. |
| es-AR | P5 `es_AR-daniela-high` | K2 `em_alex` | One Argentine model; slot 2 generic Spanish fallback. |
| es-CO | K1 `ef_dora` | K2 `em_alex` | Generic Spanish fallback; **no Colombian accent verified**. |
| es-CL | K1 `ef_dora` | K2 `em_alex` | Generic Spanish fallback; no Chilean accent verified. |
| es-PE | K1 `ef_dora` | K2 `em_alex` | Generic Spanish fallback; no Peruvian accent verified. |
| es-CU | K1 `ef_dora` | K2 `em_alex` | Generic Spanish fallback; no Cuban accent verified. |
| es-VE | K1 `ef_dora` | K2 `em_alex` | Generic Spanish fallback; no Venezuelan accent verified. |
| es-US | K1 `ef_dora` | K2 `em_alex` | Generic Spanish fallback; no US-Spanish accent verified. |
| es-UY | K1 `ef_dora` | K2 `em_alex` | Generic Spanish fallback; no Uruguayan accent verified. |
| es-EC | K1 `ef_dora` | K2 `em_alex` | Generic Spanish fallback; no Ecuadorian accent verified. |
| es-BO | K1 `ef_dora` | K2 `em_alex` | Generic Spanish fallback; no Bolivian accent verified. |
| es-DO | K1 `ef_dora` | K2 `em_alex` | Generic Spanish fallback; no Dominican accent verified. |
| es-CR | K1 `ef_dora` | K2 `em_alex` | Generic Spanish fallback; no Costa Rican accent verified. |
| es-GT | K1 `ef_dora` | K2 `em_alex` | Generic Spanish fallback; no Guatemalan accent verified. |
| ca-ES | P6 `ca_ES-upc_ona-medium` | P7 `ca_ES-upc_pau-x_low` | Native Catalan; gender unknown in cards. |
| gl-ES | N1 `Nos_StyleTTS2-Celtia-GL` | N2 `Nos_TTS-brais-vits-phonemes` | Native Galician candidates; different runtimes and untested dependencies. |
| eu-ES | P8 `eu_ES-maider-medium` | P9 `eu_ES-antton-medium` | Native Basque; gender unknown in cards. |
| en-US | P10 `en_US-kristin-medium` | P11 `en_US-joe-medium` | Native US English; Kristin source states female; Joe gender unknown. |
| en-GB | K3 `bf_emma` | K4 `bm_fable` | Native British English per Kokoro voice list; female/male stated. |
| fr-FR | P12 `fr_FR-gilles-low` | P13 `fr_FR-mls_1840-low` | Native French; gender unknown. |
| it-IT | K5 `if_sara` | K6 `im_nicola` | Native Italian per Kokoro voice list; female/male stated. |
| de-DE | P14 `de_DE-kerstin-low` | P15 `de_DE-thorsten-high` | Native German; gender unknown in cards. |
| pt-BR | K7 `pf_dora` | K8 `pm_alex` | Native Brazilian Portuguese per Kokoro voice list; female/male stated. |
| pt-PT | P16 `pt_PT-tugão-medium` | E1 `pt` | One native Portuguese Piper voice; slot 2 uses a different eSpeak engine voice, not a proven second speaker/gender. |
| ja-JP | K9 `jf_alpha` | K10 `jm_kumo` | Japanese Kokoro voices; female/male stated; `jm_kumo` needs Koniwa attribution. |

## Candidate registry and evidence

Each entry records **engine · voice ID · source locale · licence as written at source · gender stated by source · source URL**. All entries were checked 2026-09-29. Piper cards primarily state a **dataset** licence, not an express end-to-end model licence; the repository metadata states MIT. Treat these as candidates until lineage review. Kokoro model metadata states `apache-2.0`; its voice list states the genders shown. No gender is inferred from IDs.

| Ref | Engine / voice ID | Source locale | Licence stated | Gender stated | Source |
| --- | --- | --- | --- | --- | --- |
| P1 | Piper `es_ES-davefx-medium` | es_ES | `CC0` (dataset) | unknown | [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_ES/davefx/medium/MODEL_CARD) |
| P2 | Piper `es_ES-carlfm-x_low` | es_ES | `Public domain` (dataset) | unknown | [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_ES/carlfm/x_low/MODEL_CARD) |
| P3 | Piper `es_MX-ald-medium` | es_MX | `http://unlicense.org` (dataset) | unknown | [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_MX/ald/medium/MODEL_CARD) |
| P4 | Piper `es_MX-claude-high` | es_MX | `apache-2.0` (dataset) | unknown | [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_MX/claude/high/MODEL_CARD) |
| P5 | Piper `es_AR-daniela-high` | es_AR | `Attribution-ShareAlike 4.0 International` (dataset) | unknown | [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_AR/daniela/high/MODEL_CARD) |
| P6 | Piper `ca_ES-upc_ona-medium` | ca_ES | `CC BY-SA 3.0 ES` (dataset) | unknown | [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/ca/ca_ES/upc_ona/medium/MODEL_CARD) |
| P7 | Piper `ca_ES-upc_pau-x_low` | ca_ES | `CC BY-SA 3.0 ES` (dataset) | unknown | [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/ca/ca_ES/upc_pau/x_low/MODEL_CARD) |
| P8 | Piper `eu_ES-maider-medium` | eu_ES | `Creative Commons Attribution 4.0` (dataset) | unknown | [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/eu/eu_ES/maider/medium/MODEL_CARD) |
| P9 | Piper `eu_ES-antton-medium` | eu_ES | `Creative Commons Attribution 4.0` (dataset) | unknown | [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/eu/eu_ES/antton/medium/MODEL_CARD) |
| P10 | Piper `en_US-kristin-medium` | en_US | `public domain` (dataset) | female | [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/kristin/medium/MODEL_CARD) |
| P11 | Piper `en_US-joe-medium` | en_US | `CC0` (dataset) | unknown | [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/joe/medium/MODEL_CARD) |
| P12 | Piper `fr_FR-gilles-low` | fr_FR | `CC0` (dataset) | unknown | [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/fr/fr_FR/gilles/low/MODEL_CARD) |
| P13 | Piper `fr_FR-mls_1840-low` | fr_FR | `CC BY 4.0` (dataset) | unknown | [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/fr/fr_FR/mls_1840/low/MODEL_CARD) |
| P14 | Piper `de_DE-kerstin-low` | de_DE | `CC0` (dataset) | unknown | [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/de/de_DE/kerstin/low/MODEL_CARD) |
| P15 | Piper `de_DE-thorsten-high` | de_DE | `CC0` (dataset) | unknown | [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/de/de_DE/thorsten/high/MODEL_CARD) |
| P16 | Piper `pt_PT-tugão-medium` | pt_PT | `CC0` (dataset) | unknown | [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/pt/pt_PT/tug%C3%A3o/medium/MODEL_CARD) |
| K1 | Kokoro `ef_dora` | es (generic) | `apache-2.0` (model) | female | [model](https://huggingface.co/hexgrad/Kokoro-82M), [voice list](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) |
| K2 | Kokoro `em_alex` | es (generic) | `apache-2.0` (model) | male | [model](https://huggingface.co/hexgrad/Kokoro-82M), [voice list](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) |
| K3 | Kokoro `bf_emma` | en-GB | `apache-2.0` (model) | female | [model](https://huggingface.co/hexgrad/Kokoro-82M), [voice list](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) |
| K4 | Kokoro `bm_fable` | en-GB | `apache-2.0` (model) | male | [model](https://huggingface.co/hexgrad/Kokoro-82M), [voice list](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) |
| K5 | Kokoro `if_sara` | it | `apache-2.0` (model) | female | [model](https://huggingface.co/hexgrad/Kokoro-82M), [voice list](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) |
| K6 | Kokoro `im_nicola` | it | `apache-2.0` (model) | male | [model](https://huggingface.co/hexgrad/Kokoro-82M), [voice list](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) |
| K7 | Kokoro `pf_dora` | pt-BR | `apache-2.0` (model) | female | [model](https://huggingface.co/hexgrad/Kokoro-82M), [voice list](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) |
| K8 | Kokoro `pm_alex` | pt-BR | `apache-2.0` (model) | male | [model](https://huggingface.co/hexgrad/Kokoro-82M), [voice list](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) |
| K9 | Kokoro `jf_alpha` | ja-JP | `apache-2.0` (model) | female | [model](https://huggingface.co/hexgrad/Kokoro-82M), [voice list](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) |
| K10 | Kokoro `jm_kumo` | ja-JP | `apache-2.0` (model); Koniwa training audio `CC BY 3.0` | male | [model](https://huggingface.co/hexgrad/Kokoro-82M), [voice list](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) |
| N1 | Proxecto Nós `Nos_StyleTTS2-Celtia-GL` | gl | `apache-2.0` (model) | female | [model card](https://huggingface.co/proxectonos/Nos_StyleTTS2-Celtia-GL) |
| N2 | Proxecto Nós `Nos_TTS-brais-vits-phonemes` | gl | `apache-2.0` (model) | male | [model card](https://huggingface.co/proxectonos/Nos_TTS-brais-vits-phonemes) |
| E1 | eSpeak NG `pt` | pt (Portugal) | `GPL-3.0-or-later` (engine) | unknown | [supported languages](https://github.com/espeak-ng/espeak-ng/blob/master/docs/languages.md), [licence](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING) |

The [Piper repository](https://huggingface.co/rhasspy/piper-voices) metadata is `mit`, but several model cards disclose fine-tuning from another checkpoint (notably Lessac/Ryan). Do **not** redistribute these models solely on the dataset licence in this table. In particular, `ja_JP-hi_fi_captain-medium` was rejected because [its card says CC BY-NC-SA 4.0](https://huggingface.co/rhasspy/piper-voices/blob/main/ja/ja_JP/hi_fi_captain/medium/MODEL_CARD). Kokoro is a candidate, not a verified native voice for Spanish regional codes; its own card discloses CC BY training audio and some synthetic input, so its terms and provenance need final review. The Nós Galician models are large and have additional runtime dependencies (including Cotovía for phoneme models); those dependencies were not audited or installed. eSpeak NG has `es` and `es-419`, but [its supported-languages list](https://github.com/espeak-ng/espeak-ng/blob/master/docs/languages.md) does **not** claim individual Latin-American country accents or Galician.

## Attribution to preserve if used or redistributed

The Blogger credits section below is a short pointer, not a substitute for shipping full licence text and notices with model files. It names all selected CC BY / CC BY-SA items:

1. `es_AR-daniela-high`: [LibriVox / OpenSLR 61](https://www.openslr.org/61/), `Attribution-ShareAlike 4.0 International`; credit the source and model [card](https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_AR/daniela/high/MODEL_CARD), indicate changes and share alike if applicable.
2. `ca_ES-upc_ona-medium` and `ca_ES-upc_pau-x_low`: [UPC/FestCat corpus](https://collectivat.cat/asr#upc-festcat-tts-corpora), `CC BY-SA 3.0 ES`; credit corpus and respective [Ona](https://huggingface.co/rhasspy/piper-voices/blob/main/ca/ca_ES/upc_ona/medium/MODEL_CARD) / [Pau](https://huggingface.co/rhasspy/piper-voices/blob/main/ca/ca_ES/upc_pau/x_low/MODEL_CARD) cards.
3. `eu_ES-maider-medium` and `eu_ES-antton-medium`: [Itzune Maider](https://huggingface.co/datasets/itzune/maider-dataset) and [Antton](https://huggingface.co/datasets/itzune/antton-dataset), `Creative Commons Attribution 4.0`; credit datasets and Piper cards.
4. `fr_FR-mls_1840-low`: [Multilingual LibriSpeech / OpenSLR 94](https://www.openslr.org/94/), `CC BY 4.0`; credit source and [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/fr/fr_FR/mls_1840/low/MODEL_CARD).
5. Kokoro `jm_kumo`: model is Apache-2.0; its [voice list](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) points to [Koniwa *Kumo no Ito*](https://github.com/koniwa/koniwa/blob/master/source/tnc/tnc__kumonoito.txt), training audio `CC BY 3.0`. Attribute Koniwa and link the licence. Kokoro's general training credits also identify [SIWIS](https://datashare.ed.ac.uk/handle/10283/2353) (`CC BY 4.0`).

## Remaining verification

No models or audio were downloaded, Docker was not run, and no listening/quality test was performed. Check each model's full licence/lineage, applicable source attribution, runtime dependencies and the deployed package's voice list before replacing the unlicensed production proxy. The 12 Spanish regional gaps remain **accent-uncovered** even though a generic Spanish fallback can read their text.
