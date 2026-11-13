# PingKereta — Meta WhatsApp Business and Sunday launch plan
**Prepared 13 November 2026 | Target public website: Sunday, 15 November 2026**

## Decision: use Twilio with Meta, not a second direct Cloud API integration
PingKereta's existing serverless function sends owner notifications through **Twilio's WhatsApp API**. Twilio connects to your Meta WhatsApp Business Account (WABA). Use that integration for the initial authorised pilot. A direct Meta Cloud API deployment would require a distinct server implementation and new webhooks, and is **not implemented here**.

## 1. What the business owner must do in Meta (start immediately)
1. Sign in to **Meta Business Suite / Business Portfolio** at https://business.facebook.com/settings .
2. Create/select a Business Portfolio for the genuine legal business operating PingKereta. Use its **real legal name, address, phone, business email and public website**, matching official registration records. If not registered, do not invent company details; review Meta eligibility and consider a limited sandbox demonstration first.
3. Enable two-factor authentication for the people managing the portfolio. Use **Security Center** to check and, if available, begin **Business Verification** using the business registration/official documents Meta requests. Verification is separate from paid Meta Verified and can take days or weeks.
4. Set up a clear, accurate brand identity: **PingKereta** public-facing display name only if it complies with Meta naming rules and matches supporting public materials. Optional Facebook Page helps branding but is not the messaging backend.
5. Do not paste Meta tokens, payment details, verification documents or WhatsApp PINs into GitHub, public issues or ChatGPT.

Official references:
- Meta developer overview: https://developers.facebook.com/documentation/business-messaging/whatsapp/overview
- WhatsApp Business Messaging Policy: https://whatsappbusiness.com/policy/
- Meta Business Settings: https://business.facebook.com/settings

## 2. WhatsApp sender in Twilio
1. Create/sign in at https://console.twilio.com/ and upgrade/billing-enable the appropriate Twilio account if required.
2. In the Twilio Console, navigate to **Messaging → WhatsApp Senders / Register sender**; use **Self Sign-up / Embedded Signup**.
3. Sign in using the same Meta admin account. Choose the correct Business Portfolio and WABA; approve the Twilio access request.
4. Provide a dedicated sender number, with real access to SMS or voice OTP. Do **not** inadvertently deregister your personal WhatsApp line. Avoid a number already in use unless you understand the required migration/coexistence policy. Some Malaysian mobile number types can be difficult to activate; test eligibility.
5. Finish the OTP verification and check that the sender appears online/registered in Twilio. Record its E.164 WhatsApp sender ID in private account settings. The sender registration is NOT proof that message templates are approved.

Official references:
- https://www.twilio.com/docs/whatsapp/self-sign-up
- https://www.twilio.com/docs/whatsapp/key-concepts
- https://help.twilio.com/articles/360026678054

## 3. Create the approved alert template
In **Twilio Console → Messaging → Content Template Builder**, create a template such as:
- Suggested name: `pingkereta_vehicle_alert_v1` (choose an available name).
- Language: English, then Malay as a separate approved translation if desired.
- Requested category: **Utility**, subject to Meta's own classification and approval.
- Suggested body:

  `PingKereta parking alert: Your vehicle {{1}} has a new notice — {{2}}. Someone scanned your QR sticker to report a parking issue. This is an automated alert requested by someone near your vehicle. You can disable alerts in your PingKereta owner dashboard.`

- Provide safe example variables, e.g. `JXX 1234` and `Your car is blocking access`. **Variables 1 and 2 are exactly what the current backend sends.**
- Submit for WhatsApp approval. Once approved, copy the Twilio `HX...` Content SID into the **private Netlify site environment**, never into JavaScript or GitHub.

Avoid links and marketing text that could change template category. The classification and approval are Meta's decisions. Verify pricing before sending real messages.

Official references:
- https://www.twilio.com/docs/content/create-templates-with-the-content-template-builder
- https://www.twilio.com/docs/content/manage-your-templates-with-the-content-template-builder
- https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates

## 4. Phone verification (Twilio Verify)
Create/configure a Twilio **Verify Service** for pilot owner onboarding. The existing backend requests an OTP using `Channel=whatsapp` and checks it before enabling notification. Confirm the WhatsApp Verify channel and associated sender / Messaging Service are enabled for the Malaysian numbers in the pilot.

Important: Verify WhatsApp availability, account eligibility and setup vary. If OTP via WhatsApp is not available, do not simply switch the webpage to SMS without revisiting owner consent and the backend's verification semantics. A correct SMS fallback is a separate implementation task.

Official reference: https://www.twilio.com/docs/verify/whatsapp

## 5. Standalone website / Netlify environment
Connect `sahilpatel12693/pingkereta` **main** to a NEW Netlify site. Set publish directory `public`, functions `netlify/functions`, custom domain `pingkereta.com`, HTTPS active, and `www` alias. Do not replace CHAAAM.

For the **public Sunday preview**, keep:
- `PINGKERETA_ENABLE_LIVE=false`
- `PINGKERETA_RELEASE_APPROVED=false`
No WhatsApp credentials are required for the preview.

When a separate operator-supervised pilot has been security-reviewed, configure in the **Netlify site environment**:
- `PINGKERETA_PILOT_INVITE_SECRET`: random high-entropy string, 32+ characters.
- `PINGKERETA_DATA_ENCRYPTION_KEY`: 32 cryptographically random bytes in 64 hexadecimal characters.
- `PINGKERETA_TWILIO_ACCOUNT_SID`: your Twilio account SID.
- `PINGKERETA_TWILIO_AUTH_TOKEN`: private Twilio authentication token.
- `PINGKERETA_TWILIO_VERIFY_SERVICE_SID`: the service handling owner OTP.
- `PINGKERETA_TWILIO_WHATSAPP_FROM`: Twilio/Meta approved sender in `whatsapp:+...` format.
- `PINGKERETA_WHATSAPP_CONTENT_SID`: Meta-approved Twilio utility template `HX...`.
- `PINGKERETA_TWILIO_STATUS_URL`: `https://pingkereta.com/api/pingkereta/twilio-status`, exactly matching Twilio's signed status callback URL.

Keep both live flags false until release approval. Existing GitHub CI is not a substitute for WhatsApp sender approval or actual provider delivery testing.

## 6. End-to-end tests before real launch
- Deploy, verify HTTPS and `GET /api/health` success, and the public homepage/Test Lab.
- In preview, `GET /api/pingkereta/status` must return `{"mode":"preview",...}`; an actual create/alert call must remain unavailable.
- Separately in an isolated staging/pilot environment, validate authorised vehicle registration, invitation issuance, verified WhatsApp OTP and explicit opt-in.
- Verify QR scan on iOS and Android using **two separate phones**; send a predefined alert. Confirm the registered owner received it on the real handset.
- Check submitted → sent → delivered/read callbacks and failure/error cases. A Twilio message SID alone is not proof of delivery.
- Validate opt-out, consent withdrawal, repeated alerts, spam/abuse protection, deleted vehicle QR revocation, failed OTP, account recovery and user-data deletion.
- Do not activate public registrations until **atomic rate limiting, owner verification, one-time invitation redemption, durable messaging, STOP/unsubscribe handling, multi-device recovery, retention and Malaysia PDPA review** are complete. The current Netlify Blobs implementation is a controlled-pilot foundation, not a fully security-audited public service.

## Sunday decision
**GO:** public, independent PingKereta website and simulated Test Lab after Netlify DNS/HTTPS and smoke tests pass.
**CONDITIONAL GO:** closed, operator-supervised WhatsApp pilot only after Meta/Twilio approval and real handset, abuse, privacy and account-ownership testing pass.
**NO-GO:** broad public QR registrations or claims of instant guaranteed WhatsApp delivery without the remaining safeguards.
