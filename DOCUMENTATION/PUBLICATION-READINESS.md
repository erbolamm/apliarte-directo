# Public release gates — ApliArte Directo

**Status: NOT APPROVED FOR PUBLICATION OR DEPLOYMENT.** This branch is a preparation workspace, not a release. Keep the repository private and the current VPS unchanged until every blocking gate below has evidence and Javier approves the final review.

## What works in this branch

| Area | Current evidence | Limit |
| --- | --- | --- |
| WebSocket roles | Sender and receiver ACLs, top-level type parsing, PCM relay and disconnect cleanup have integration tests. | Browser and OBS end-to-end QA remains. |
| Private credentials | The admin panel can persist Twitch IRC/VDO camera/OpenAI and now WHIP stream key/VDO mixer settings under ignored `data/config.json` (0600). WHIP re-reads its own settings on each start. | `PANEL_PASS` still requires local `.env`. |
| Landing | Local-open CTA, install/update commands, demo, community links and public-host route exist. | A web page cannot start a local Docker service. DNS/proxy and all external links need live verification. |
| Demo | Agent selection, chat, selected commands, canvas response and optional browser TTS run locally without write API/WebSocket. | Game practice and fidelity with the real 3D/voice experience are incomplete. |
| Automated tests | Node suite passed locally after recent feature work. | No Docker image build, browser visual/audio or Pixel→OBS QA yet. |

## Blocking gates before visibility change or push

1. **History and secrets:** Perform a non-disclosing scan of the entire history and current tree. Earlier internal review flagged legacy credential material; do not publish this private history as-is. Rotate any affected credential, then prepare a clean public initial snapshot without rewriting or deleting the private checkout. Review the exact snapshot contents before push.
2. **Complete first-run experience:** Provide a safe first-run flow for `PANEL_PASS` without shared defaults. Confirm a new clone can start its private panel, enter its own credentials, restart/update, and retain them without copying Javier's local `data/` or `.env`.
3. **Finish demo contract:** Simulate the existing game flows and agent interactions, including visitor-local isolation and public/private `!traidor` boundary. Prove the demo makes no writes to `/api`, Twitch, OBS or other visitors. Do not label it a complete functional demo before this.
4. **Build and exercise both images:** Build local and `vps-overlay` Docker contexts, test panel→WHIP configuration and the private `/ws` handshake, then repeat the full test suite in a clean checkout with installed dependencies.
5. **Public routing:** Verify `directo.apliarte.com` serves the landing/demo and rejects public admin and all write APIs at the active proxy. Check GitHub Issues, Sponsors, social/share links and the actual remote visibility live.
6. **Reversible live QA:** After a scoped deployment is approved, verify deployed commit/proxy version and conduct Pixel→OBS camera, PCM, chat and game QA; a 200 response or static tests are not proof of audible/visible output.

## Final approval handoff

Present to Javier the exact release snapshot hash, file list, secret-scan result without values, tests/build outputs, proxy policy, rollback plan and remaining risks. Only after his explicit final approval: publish the sanitized repository, verify the remote hash/visibility, and deploy the reviewed version. Never force-push or rewrite the existing private history.
