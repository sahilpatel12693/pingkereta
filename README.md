# PingKereta — standalone preview website

**Primary domain:** https://pingkereta.com/

This repository now contains two codebases:
- `public/`, `netlify/`, `tests/`: the newer independent QR parking alert website migrated from the CHAAAM prototype.
- `app.py`, `templates/`, `static/`: legacy Flask/Telegram app retained during migration so previous QR stickers, data and deployments are not disrupted.

## Current state
- Mobile-first bilingual Malay/English interface, QR scan concept, owner preview and a **fully simulated** test lab at `/test/`.
- Production WhatsApp integration is implemented only as a gated, unverified pilot foundation. **Live registration and messaging are OFF by default** in both the browser and the API.
- No live data, stickers, secrets or existing users have been copied from CHAAAM or the legacy Render/SQLite service.

## Netlify deployment
1. Create a **new** Netlify site from this GitHub repo's `main` branch. It is not the CHAAAM Netlify site.
2. Publish directory: `public`; functions: `netlify/functions`. The checked-in `netlify.toml` sets both. Node 22 recommended. Netlify should install the Node dependencies listed in `package.json`.
3. Confirm the generated `*.netlify.app` preview loads at `/` and `/test/`; confirm `/api/pingkereta/public` returns a disabled-service response (503).
4. Add `pingkereta.com` as a custom domain, then set Namecheap DNS to the exact records **displayed for this site by Netlify**; add `www.pingkereta.com` as an alias or redirect as preferred.
5. Wait until Netlify reports active HTTPS and verify both apex and www. Test on mobile. Do not update old CHAAAM or legacy QR URLs until this is verified.
6. Update old CHAAAM `/pingkereta/` routes with 301 redirects only after the new domain is fully live and any existing stickers/data are assessed.

## Safety and go-live
Never set `PINGKERETA_ENABLE_LIVE=true` as part of the domain migration. Complete ownership verification, one-time invite issuance, OTP/account recovery, transactional abuse prevention, Malaysia PDPA/privacy policy and deletion, operator access controls, approved WhatsApp sender/templates and real-device callback tests first. See `docs/standalone-migration.md`.

Run tests: `npm test` (Node.js 22); syntax: `npm run check`.

Do not put Netlify, Twilio, WhatsApp, Telegram or domain registrar credentials in GitHub or QR URLs.
