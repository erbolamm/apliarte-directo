# 📚 Technical Documentation

Welcome to the technical documentation suite for **ApliArte Directo**.

This repository contains the complete, containerized, and decoupled architecture for Twitch live streaming via WebRTC/WHIP, real-time 3D interactive diorama overlays with Three.js, digital audio relay, and an accessible mobile control dashboard.

---

## 🗺️ Documentation Index

0. [**Product Landing Page (`landing.html`)**](../public/landing.html)
   - Official product showcase complying with INBOX.md and ApliArte Brand Kit.
   - Light/Dark theme switcher with local storage persistence.

1. [**Web MCP Semantic Documentation Portal (`/docs`)**](../public/docs/index.html)
   - Interactive Web MCP tool console for autonomous AI agents and browsers.
   - Declarative Semantic HTML tools (`tool-name`, `description`, `tool-param-description`).
   - JSON-LD Schema.org machine-readable metadata.

2. [**Service Architecture (`ARCHITECTURE.md`)**](./ARCHITECTURE.md)
   - Detailed container topology (`overlay`, `whip`, `caddy`).
   - Secure internal communication via private bridge network and HTTP control API.
   - Elimination of host Docker daemon socket and elevated privileges.

2. [**VPS Deployment Guide (`DEPLOYMENT.md`)**](./DEPLOYMENT.md)
   - Step-by-step 5-minute deployment instructions for Linux VPS.
   - Quick start with `docker compose up -d`.
   - Setup options with and without automated SSL reverse proxy.

3. [**Configuration Reference (`CONFIGURATION.md`)**](./CONFIGURATION.md)
   - Full reference of all environment variables (`.env`).
   - Network ports, persistence volumes, and filesystem permissions.
   - Twitch stream key and VDO.ninja mixer settings.

4. [**Security Audit & Directives (`SECURITY.md`)**](./SECURITY.md)
   - Hardening against arbitrary code execution.
   - Elimination of `/var/run/docker.sock` mount.
   - Strict password enforcement and zero plaintext secrets.
   - Reverse proxy IP spoofing mitigation.

5. [**Architecture Decision Record (`ADR-0001`)**](./ADR-0001-docker-architecture-decoupling.md)
   - Context, decision, discarded alternatives, and technical consequences.

