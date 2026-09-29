# ADR-0001: Docker Container Architecture and Modular Decoupling

- **Status**: Approved
- **Date**: 2026-09-27
- **Scope**: Standalone repository `apliarte-directo`

---

## 🎯 Context

1. The live streaming suite and 3D overlay originated inside the `erbolamm-trabajo` central workspace.
2. To enable isolated testing and clean modular maintenance, the project was decoupled into an autonomous, strictly private repository.
3. **Governance & Privacy**: The repository, documentation, and services remain 100% private and restricted to the local environment. Public deployment or external exposure is strictly forbidden until a dedicated Landing page is created and the canonical INBOX protocol is formally completed.
4. Security audits identified and eliminated critical risks (mounting `/var/run/docker.sock` and hardcoded default credentials), yielding a hardened, modular Docker stack deployable locally in 5 minutes.

---

## 💡 Decision

1. **Modular Service Topology**:
   - `overlay`: Node.js 22 LTS container for the 3D diorama scene, WebSocket PCM audio relay, Twitch chat IRC, and mobile cockpit. Runs unprivileged without access to the Docker daemon.
   - `whip`: Headless Chromium container with Puppeteer capturing VDO.ninja and streaming to Twitch via WHIP. Exposes an internal HTTP control API on port `:3000` (private bridge network).
   - `caddy`: Optional reverse proxy (`ssl` profile) for automatic Let's Encrypt SSL/TLS certificates.
2. **Network Isolation**: Dedicated private bridge network `directo-network`.
3. **Persistent Storage**: Mapped host volumes for `./data` and `./medios`.
4. **Security Hardening**: Mandatory `PANEL_PASS` enforcement; zero plaintext secrets in code.

---

## 💥 Consequences

- **Positive**: Total portability across any VPS supporting Docker, low RAM usage (~400 MB), zero host privilege escalation vectors.
- **Constraints**: Requires defining `PANEL_PASS` prior to production deployment.
