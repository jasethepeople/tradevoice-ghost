# Launch checklist

## Honest implementation status

This repository has a working, responsive dashboard prototype, local CSV call audit, installable PWA shell, trade-specific triage prompt, and server-side Twilio / Retell / Supabase / Stripe webhook paths. The dashboard currently uses sample calls; its settings, metrics, and approve-booking action are not connected to a signed-in business account. There is no production authentication flow, no Jobber or Housecall Pro OAuth callback, and no CRM job-creation adapter. Do not describe those pieces as live or connect real customer data until they are built and tested.

The guarded Twilio provisioning endpoint can buy a specified eligible number and configure callbacks. It does not search inventory or automatically create/configure a Retell agent. The account owner must configure the appropriate Retell inbound SIP route and webhook in Retell first.

## Accounts and setup

- [ ] Supabase project created; run `supabase/schema.sql`; create the real shop row in `businesses`; confirm RLS and server-role-key access.
- [ ] Supabase Auth sign-in and tenant-scoped dashboard data access implemented before the app is used with actual caller information.
- [ ] Production HTTPS origin configured as `PUBLIC_APP_URL`.
- [ ] Twilio test account first, then production account; verify voice and SMS capabilities, emergency address, number ownership, A2P/10DLC registration, and any required toll-free verification.
- [ ] Create a Retell agent from `docs/RETELL-AGENT-PROMPT.md`; fill shop name/trade/service area; set the required custom-analysis fields; configure SMS consent collection and recording disclosure; test emergency, negative-hazard, dropped-call, and voicemail flows.
- [ ] Configure Retell inbound SIP routing and webhook events `call_ended` / `call_analyzed`. A real call is required to verify that Twilio's SIP leg and Retell's `twilio_call_sid` identify the same call in this account.
- [ ] Set `RETELL_COST_PER_MINUTE_USD` or the business row's `voice_cost_per_minute` using the actual provider invoice. Confirm minute rounding and the 15-minute per-call limit against plan expectations.
- [ ] Provision one test number through `/api/twilio/provision`; check normal answer, plan cap reached, no-answer, voicemail, callback delivery, SMS consent, STOP, and owner escalation. Then test an eligible Pro shop with a second number.
- [ ] Configure Stripe products for $49 / 100 minutes, $99 / 300 minutes, and $199 / 800 minutes. The Growth / Pro add-ons in the UI are positioning, not a substitute for finalized Stripe product terms. Put each actual Stripe price ID in the matching env variable; test webhook signature and subscription cancellation in test mode.

## CRM integrations still to build

- **Jobber:** create and register a Jobber developer app, complete OAuth callback/scopes and token refresh/storage, then test client + property + work-request/job mutations against the current GraphQL schema. Implement idempotent sync from a reviewed `booking_requests` row and handle Jobber `userErrors`. The app currently captures a booking request but does not create a Jobber record.
- **Housecall Pro:** confirm this business is eligible for the required API. Implement the customer/address/job workflow against the account's current public API and credentials; OAuth is available only for approved partner contexts, while a business-owned integration may use a company API key where its plan permits. The current app does not create a Housecall Pro job.
- [ ] In both adapters, map `customer_name`, `customer_phone`, full address, trade, issue, triage notes, urgency, requested window, and call/recording reference. Do not convert “next-day request” to a confirmed appointment without checking actual schedule availability.
- [ ] Store provider tokens encrypted, rotate/refresh them, support disconnect/revocation, and never pass credentials to browser code.

## Security, legal, and service quality

- [ ] Add account authentication, business/team authorization, rate limits, request-size limits, retention settings, and verified ownership before exposing live call/booking data.
- [ ] Confirm lawful recording notice/consent requirements where each shop answers calls. Keep recordings off until the shop has approved its policy.
- [ ] Preserve SMS consent source/time, honor STOP immediately, and avoid texting people without a documented permission basis. The webhook only auto-sends a missed-call text to an opted-in number.
- [ ] Add a staffed escalation fallback for owner-call failures. The current high-urgency handler makes one owner call and SMS attempt; it is not an emergency-dispatch service.
- [ ] Test every supported trade with a licensed technician; Ghost is intake software, not a diagnostic or emergency-response product.
- [ ] Add monitoring for webhook failures, Twilio/Retell provider errors, budget/cost drift, stale minute reservations, and failed recording retrieval.
- [ ] Validate `npm run lint`, `npm test`, and `npm run build` in CI; test calls and Stripe in provider sandbox accounts.

## First-customer offer and no-ads GTM

1. Join **HVAC Owners**, **Plumbing Owners**, and **Electrical Contractors** only after checking each group's rules and introducing yourself transparently as a builder/vendor.
2. Lead with the free call-log audit: let a prospect upload last month's CSV locally and show how the estimate is calculated. Do not imply the estimate is guaranteed recovered revenue.
3. Ask explicit permission before posting any customer call recording or ROI screenshot. Use a consenting demo caller or a redacted, consented customer example; disclose that the voice is AI-generated/AI-operated and remove names, phone numbers, addresses, and recording metadata.
4. Offer “Recover 1 job or money back” only after defining eligibility, attribution, trial window, refund method, and written terms. Do not promise refunds in public copy before that policy is approved.
5. Track source group, call volume, opt-in, booked jobs, completed jobs, actual ticket value, and refund requests. Report real results separately from the prototype's illustrative dashboard metrics.

Draft first post:

> I’m building TradeVoice Ghost for small HVAC / plumbing / electrical shops that miss calls while the crew is on a job. I’m offering a free, private audit of last month’s call-log CSV so owners can see how many calls went unanswered and what a conservative booking estimate would look like. The file is analyzed in your browser and isn’t uploaded. I’m looking for a few shops willing to test the workflow; happy to share exactly how the estimate is calculated. Admins, please remove this if vendor posts aren’t allowed.

## Official integration references

- [Retell webhooks and signature verification](https://docs.retellai.com/features/secure-webhook)
- [Retell inbound calls](https://docs.retellai.com/deploy/inbound-call)
- [Twilio Voice webhooks](https://www.twilio.com/docs/voice)
- [Jobber API and OAuth](https://developer.getjobber.com/docs)
- [Housecall Pro API authentication](https://docs.housecallpro.com/docs/partner-jobs/b87d37ae48a0d-authentication)
- [Housecall Pro public API](https://docs.housecallpro.com/)
