# PingKereta: CHAAAM → pingkereta.com migration (2026-11-13)

## Completed in this GitHub branch
- Standalone site files copied from the latest CHAAAM PingKereta preview.
- Site canonical, branding, sticker-print text, test-lab navigation and dynamic scanner links now use pingkereta.com and standalone root paths.
- Netlify API still routes `/api/pingkereta/*`; server-generated QR/scan URLs now point to `https://pingkereta.com/?code=...`.
- Legacy Flask/Telegram app files are preserved, not used by the new Netlify web deployment.
- The live backend is deliberately disabled unless `PINGKERETA_ENABLE_LIVE=true` is configured **and** the frontend preview-only flag is changed after approval.

## NOT done by GitHub changes
- Domain DNS and Netlify custom-domain/HTTPS binding (requires access to Netlify site admin and Namecheap DNS).
- Transfer of Netlify Blobs, Render SQLite, verified phone data, session cookies, owner accounts or QR sticker records.
- Twilio/WhatsApp sender verification, approved templates, live delivery, user consent or privacy policy review.
- CHAAAM redirects and decommissioning. Do not change old URLs until a cutover is verified.

## Standalone routes
| Route | Purpose |
| --- | --- |
| `/` | PingKereta preview homepage |
| `/test/` | Isolated in-browser simulated Test Lab |
| `/api/pingkereta/*` | Live backend API (disabled by default) |

## DNS and launch sequence
1. In Netlify create separate site from `sahilpatel12693/pingkereta`, build root repository, publish `public`.
2. Verify `/test/`, assets and safe 503 for live API on generated Netlify URL.
3. Add `pingkereta.com` custom domain in new Netlify site. Configure DNS using **Netlify's provided values** at Namecheap. Check HTTPS certificate issuance.
4. After the apex works, configure and test `www` alias as appropriate.
5. Run mobile QR, scanner and simulator regression tests. QR codes must never route to CHAAAM.
6. Audit all live users/stickers on CHAAAM/Render before importing data or using 301 redirects from those original hosts. Existing stickers with hardcoded links require explicit redirect on their original host.
7. Keep live messaging switched OFF until independent security, privacy, rate limiting, verified ownership and WhatsApp compliance checks pass.

## Environment values for eventual controlled pilot only
- `PINGKERETA_ENABLE_LIVE` (must remain unset/false for this migration)
- `PINGKERETA_PILOT_INVITE_SECRET`
- `PINGKERETA_DATA_ENCRYPTION_KEY`
- `PINGKERETA_TWILIO_ACCOUNT_SID`, `PINGKERETA_TWILIO_AUTH_TOKEN`
- `PINGKERETA_TWILIO_VERIFY_SERVICE_SID`
- `PINGKERETA_TWILIO_WHATSAPP_FROM`, `PINGKERETA_WHATSAPP_CONTENT_SID`
- `PINGKERETA_TWILIO_STATUS_URL=https://pingkereta.com/api/pingkereta/twilio-status` (only after HTTPS and signed webhook validation)
- Optional legacy Telegram variables — avoid using as the primary channel.

## Security limitations
Netlify Blobs is not a transactional database. Per-record and rate-limit read-modify-write operations can race. Live owner verification, recovery, one-time HMAC invites, anti-abuse controls, privacy/deletion/retention and deliverability/cost controls are not ready for a public launch.
