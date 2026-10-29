# TradeVoice Ghost

A responsive dashboard and backend starter for an AI receptionist aimed at one-to-five-truck HVAC, plumbing, and electrical shops. The front end opens in a clearly labeled demo workspace; it does not pretend its sample calls or ROI numbers are live customer data.

## What is included

- Responsive, installable PWA dashboard with call list, urgency labels, private call-detail drawer, recording playback when a real recording URL is supplied, and owner-review actions.
- Browser-only call-log CSV audit. The selected file is never uploaded; the estimate uses a clearly disclosed 35% assumed booking rate and the shop's configurable average job value.
- HVAC, plumbing, and electrical triage guidance in `src/lib/triage.ts` and a ready-to-configure Retell voice-agent prompt in `docs/RETELL-AGENT-PROMPT.md`.
- Twilio number purchase/configuration endpoint, signed inbound voice and SMS handlers, SIP handoff to a configured Retell endpoint, voicemail capture, opt-in-aware missed-call SMS, and high-urgency owner call/SMS escalation.
- Retell webhook signature checks, call and recording metadata storage, triage/booking-request capture, per-minute provider-cost estimates, and idempotent webhook handling.
- Supabase schema with row-level security, atomic monthly minute reservations, and plan limits of 100 / 300 / 800 minutes. Calls are time-limited to the smaller of the remaining plan balance or 15 minutes.
- Stripe Checkout-session and webhook endpoints. Stripe products/prices, provider credentials, and webhook setup are not included.

## Run the demo

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The Settings page saves its demo preferences on that device. Use **Free call audit** to upload a call-log CSV, or download the included sample from that page. Run `npm run lint`, `npm test`, and `npm run build` to check the project.

## Live-service boundary

The dashboard is a prototype, not a multi-user production SaaS login. Its sample calls, plan changes, and approve-booking button are demo-only; it does not yet load or mutate a shop's Supabase call data from the UI. The server-side inbound voice, Retell, SMS, number-provisioning, minute-cap, and Stripe paths are implemented, but require your own accounts, secrets, Supabase schema, public HTTPS deployment, and provider setup. **Do not expose a live customer dashboard until you add Supabase Auth-backed sign-in and connect its pages to tenant-scoped data.** The server-only integration endpoints are separately protected or signature-verified.

Direct Jobber and Housecall Pro job creation is not implemented in this starter. Jobber needs a registered OAuth app and a tested GraphQL workflow for the shop's account/schema; Housecall Pro's public API access depends on the account/API program, and its OAuth route is not universally available. The Settings buttons deliberately explain this instead of claiming a fake connection. See `docs/LAUNCH-CHECKLIST.md` for the exact boundary and prerequisites.

## Environment and database

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Copy `.env.example` to `.env.local` and fill only values you have actually created. Never expose a service-role key or provider secret through a `NEXT_PUBLIC_` variable.
3. Create the first `businesses` row in Supabase with the shop name, trade, owner phone, plan, and the provider's actual per-minute rate. Do not use the example shop details shown in the demo.
4. Deploy the app to a public HTTPS origin and set `PUBLIC_APP_URL` to that exact origin before registering provider callbacks.
5. Configure a Retell agent and inbound SIP target using the checked-in prompt. Then provision a Twilio number with the guarded endpoint below.

Twilio provisioning requires `INTEGRATION_SETUP_SECRET` as a bearer token, a business UUID, an E.164 number that is available for purchase in your Twilio account, and that number's Retell SIP URI:

```bash
curl -X POST "$PUBLIC_APP_URL/api/twilio/provision" \
  -H "Authorization: Bearer $INTEGRATION_SETUP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"businessId":"YOUR_BUSINESS_UUID","phoneNumber":"+15551234567","retellSipUri":"sip:YOUR_RETELL_INBOUND_URI"}'
```

The endpoint purchases the specified Twilio number, configures voice/SMS callbacks, and records it for minute-cap enforcement. It removes the Twilio number if saving its database record fails. Use a test account first.

## Routes

| Route | Purpose |
| --- | --- |
| `POST /api/twilio/provision` | Protected Twilio-number purchase and callback setup |
| `POST /api/twilio/inbound` | Validates Twilio signature, reserves minutes, then routes to the configured SIP target or voicemail |
| `POST /api/twilio/call-result` | Settles reserved minutes, sends permitted fallback text, and captures voicemail if routing fails |
| `POST /api/twilio/voicemail` | Saves voicemail metadata and alerts the owner |
| `POST /api/twilio/sms` | Validates inbound SMS; handles YES / STOP / START / HELP and queues a follow-up request |
| `POST /api/retell/webhook` | Validates Retell HMAC; records `call_ended` / `call_analyzed` events, alerts on high urgency, and creates review requests |
| `POST /api/billing/checkout` | Starts Stripe subscription Checkout; protected by the setup secret |
| `POST /api/billing/webhook` | Verifies Stripe events and updates the shop's plan |

Set Retell's webhook URL to `https://YOUR_HOST/api/retell/webhook` and subscribe to `call_ended` and `call_analyzed`. Set the Stripe webhook URL to `https://YOUR_HOST/api/billing/webhook` and enable `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.

## Safety and privacy

- The Retell prompt tells the agent to identify itself as AI, avoid repair instructions, and direct callers facing fire, suspected gas/CO danger, electrical hazards, or medical emergencies to get to safety and contact emergency services.
- Recordings should remain off until the shop configures its disclosure/consent policy for the places it serves. The UI warns owners about local call-recording rules.
- Automated texts are sent only when an opt-in record exists; inbound `STOP` removes that permission. Configure Twilio A2P/10DLC and sender registration where required.
- The free CSV audit runs in the browser. It reads no more than 10 MB per file and stores no uploaded call list.
- Retell cost estimates use the per-minute rate stored on the business row (or `RETELL_COST_PER_MINUTE_USD` as a fallback). Set it from the actual Retell account invoice; zero is the default, not a quoted provider rate.
- Supabase RLS protects owner-readable rows. The service-role key is used only in signed/provider server handlers and must remain private.

## Test note

Provider callbacks and number purchases need real sandbox credentials for end-to-end verification. The automated tests cover local triage classification and signature/routing helpers; they do not claim a live Twilio, Retell, Jobber, Housecall Pro, Supabase, or Stripe connection has been exercised.
