# Saturday 14 November 2026 — PingKereta backend / domain cutover runbook

**Scope:** deploy a **standalone preview** on `pingkereta.com` without disrupting CHAAAM or the original Flask/Render service. **No live parking notifications, registration, real OTP or messages.**

## Before opening the hosting dashboard
- Repository: `sahilpatel12693/pingkereta` branch `main`
- Do not replace the CHAAAM Netlify site or modify its domain settings.
- Required access: GitHub (connected), Netlify account for a new independent site, and the registrar/DNS account controlling `pingkereta.com`.
- No secrets needed for preview; set `PINGKERETA_ENABLE_LIVE=false` and `PINGKERETA_RELEASE_APPROVED=false` in **the new PingKereta site's environment**. Do not configure production Twilio credentials for the preview.

## 1. Deploy independently
1. In Netlify, **Add new project / Import from Git**, choose the repository above, and use `main`.
2. Framework: no framework. Build command: leave blank. Publish directory: `public`. Netlify functions: `netlify/functions` from `netlify.toml`. Use Node.js 22.
3. Check deployment success and the temporary `<site>.netlify.app` address.
4. On a machine with Node.js 22, from the repo: `npm run preflight`; then `npm run smoke -- https://<site>.netlify.app`.
5. Independently open `/`, `/test/`, `/app.js`, `/api/health`. Confirm `/api/pingkereta/public?code=000000000000000000000000` returns **503** (backend disabled), not 200.

## 2. Set up the domain
1. Add `pingkereta.com` as a custom domain **on the independent PingKereta Netlify site**.
2. Obtain the exact DNS records displayed in Netlify's Domain management; update those records in your current DNS provider. Do not guess Netlify apex/CNAME targets.
3. Add `www.pingkereta.com` as the secondary alias/redirect according to Netlify's settings.
4. Verify `https://pingkereta.com/` has a valid HTTPS certificate. Repeat the read-only smoke test on the final domain.
5. Test on iPhone and Android browsers, desktop, mobile responsive, the Test Lab and printable sticker. These are **simulated tests**, not real message delivery.

## 3. Freeze production data and establish a clean boundary
- Leave the CHAAAM `/pingkereta/` page and any original Render/Flask service unchanged.
- **Do not** migrate Netlify Blobs or SQLite rows by simply copying files between incompatible schemas.
- Audit which domain is embedded in any existing real QR sticker; a QR referring to an old domain requires a redirect from **that original domain**, not just a DNS change for the new domain.
- Do not enable live API. Operator invitation gate, rate limits and duplicate-claim checks are not atomic; owner recovery/verification and data privacy procedures still need production work.

## 4. Future controlled pilot — NOT Saturday's public launch
Obtain separately: a verified Meta/Twilio WhatsApp sender, an approved utility template, Twilio Verify service, phone/consent policy, test Malaysian handset, and security/operator review. Configure all secret values only in Netlify encrypted environment settings after approvals. Maintain two explicit release flags (`PINGKERETA_ENABLE_LIVE`, `PINGKERETA_RELEASE_APPROVED`); both must remain false until verified.

Pilot validation must cover authorised vehicle ownership, single-use registration, OTP expiry, withdrawal of consent, delivery callbacks, anti-spam/cost limits, account recovery, data deletion and Malaysian privacy requirements. The included production preflight validates **configuration shape only** and does not satisfy these gates.

## Rollback and proof of completion
- If DNS/HTTPS or preview smoke tests fail, keep the original CHAAAM page intact, revert only the new domain's DNS/site binding, and keep both release flags false.
- Record the Netlify site URL, the apex and www HTTPS result, CI run link, and test screenshots/results.
- Completion criterion for Saturday: a working **standalone preview at `https://pingkereta.com/`** with safe 503 responses for real API calls, no unrelated CHAAAM navigation, and unchanged legacy stickers/routes.
