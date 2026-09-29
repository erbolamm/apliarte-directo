# 🛡️ Security Audit & Directives

Security is a fundamental design requirement of **ApliArte Directo**. Because the system is designed to run on internet-facing cloud VPS instances, defensive boundaries are enforced by design.

---

## 🚫 1. Total Elimination of the Docker Socket (`/var/run/docker.sock`)

### Prior Vulnerability
Many live streaming stacks mount `/var/run/docker.sock` inside web containers so that web code can trigger `docker start` or `docker stop` commands against auxiliary streaming services.

**Risk**: Mounting the host Docker daemon socket into a container grants permissions equivalent to `root` on the host machine. Any vulnerability or code injection in the Node.js web server would allow full host takeover.

### Defensive Architecture
- **Internal HTTP Control Plane**: The `whip` service exposes an internal mini-API on port `3000`, accessible only over the private `directo-network` bridge.
- The `overlay` service communicates with `http://whip:3000/start`, `/stop`, and `/status` using native `fetch` requests.
- **Outcome**: The `overlay` container runs without any access to the host Docker daemon, eliminating privilege escalation risks.

---

## 🔑 2. Credential Hygiene and Secret Management

1. **No Default Passwords in Code**:
   - `server.js` validates the presence of `PANEL_PASS`.
   - In production (`NODE_ENV=production`), if `PANEL_PASS` is empty or missing, the server **immediately halts execution** (`process.exit(1)`), preventing unauthenticated deployment.
2. **Git Leak Prevention**:
   - The `.gitignore` file strictly excludes `.env`, `.env.local`, and generated camera configurations (`camara.json`).
   - Do **not** infer that the repository or its history is secret-free from `.gitignore`. Historical commits require a non-disclosing scan and any affected credentials must be rotated before visibility changes. See [Public release gates](./PUBLICATION-READINESS.md).
   - Panel-managed streaming credentials live in ignored `data/config.json` with mode 0600; the WHIP container mounts `data/` read-only. Back up and protect that local directory separately from Git.

---

## 🌐 3. Reverse Proxy IP Spoofing Prevention

The server implements `getClientIp(req)` with strict `isKnownTrustedProxy(ip)` checks:
- Forwarded headers (`x-forwarded-for` and `x-real-ip`) are only accepted when the immediate connection originates from a known, trusted proxy (such as Caddy on the Docker bridge `172.16.0.0/12` or `127.0.0.1`).
- If an external client attempts to forge headers (`X-Forwarded-For: 127.0.0.1`) directly against the server port, the forged header is rejected and the socket TCP IP is used, preventing authentication bypass.

---

## 🧱 4. Network Isolation (Principio of Least Privilege)

- Internal service control ports (such as the `:3000` WHIP endpoint) are **never published to the host**.
- Only the public overlay port (`:7979`) or Caddy web ports (`:80` / `:443`) are mapped externally.
- The `directo-network` operates in isolated bridge mode with no visibility into other container networks on the host.

---

## 📷 5. Private VDO camera configuration

`GET /api/directo/camara/config` contains connection parameters and must require application authentication and `Cache-Control: no-store` in both server variants. The OBS 3D plano may consume this endpoint; before deploying a changed authentication rule, confirm that OBS uses a private Tailnet route or an equivalent authenticated path and test the camera source. Never publish this API merely to make the public demo work.

The checked-in reverse-proxy snapshot is not proof of the effective VPS policy. Verify active proxy rules, Docker port bindings and host firewall before declaring the service private. Back up configuration and data, prepare rollback, and test private OBS plus external denial after deployment.
