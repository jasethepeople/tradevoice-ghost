import { getAdminDb, twiml, verifyTwilioRequest, xmlEscape } from "@/lib/server";

function formValues(form: FormData) {
  return Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
}

export async function POST(request: Request) {
  const values = formValues(await request.formData());
  if (!verifyTwilioRequest(request, values)) return new Response("Invalid signature", { status: 401 });
  const phone = (values.From ?? "").replace(/[^+\d]/g, "");
  const businessNumber = (values.To ?? "").replace(/[^+\d]/g, "");
  const reply = (values.Body ?? "").trim().toUpperCase();
  try {
    const db = getAdminDb();
    const { data: line, error: lineError } = await db.from("business_numbers").select("business_id").eq("phone_number", businessNumber).eq("active", true).maybeSingle();
    if (lineError) throw lineError;
    if (!line) return twiml("<Message>We couldn't match this number to a shop. Please call the number on our website.</Message>");
    if (/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$/.test(reply)) {
      const { error } = await db.from("sms_consents").upsert({ business_id: line.business_id, phone_number: phone, opted_in: false, consent_source: "customer_sms_stop", updated_at: new Date().toISOString() }, { onConflict: "business_id,phone_number" });
      if (error) throw error;
      return twiml("<Message>You are opted out and will not receive further messages. Reply START to opt in again.</Message>");
    }
    if (/^(START|UNSTOP)$/.test(reply)) {
      const { error } = await db.from("sms_consents").upsert({ business_id: line.business_id, phone_number: phone, opted_in: true, consent_source: "customer_sms_keyword", updated_at: new Date().toISOString() }, { onConflict: "business_id,phone_number" });
      if (error) throw error;
      return twiml("<Message>You are opted in to service texts from this shop. Reply STOP to opt out.</Message>");
    }
    if (reply === "HELP") return twiml("<Message>Reply YES to request a service follow-up, or STOP to opt out. Message and data rates may apply.</Message>");
    if (!/^(YES|Y)$/.test(reply)) return twiml("<Message>Reply YES to ask the shop to follow up about a service visit, or STOP to opt out.</Message>");
    const { error: consentError } = await db.from("sms_consents").upsert({ business_id: line.business_id, phone_number: phone, opted_in: true, consent_source: "customer_sms_keyword", updated_at: new Date().toISOString() }, { onConflict: "business_id,phone_number" });
    if (consentError) throw consentError;
    const { data: recent, error: recentError } = await db.from("call_logs").select("id,customer_name,trade,issue,triage_notes,address").eq("business_id", line.business_id).eq("caller_phone", phone).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (recentError) throw recentError;
    const { error: bookingError } = await db.from("booking_requests").upsert({ business_id: line.business_id, call_log_id: recent?.id ?? null, customer_name: recent?.customer_name ?? "Caller", customer_phone: phone, trade: recent?.trade ?? null, issue: recent?.issue ?? "Caller replied YES to request a service visit", address: recent?.address ?? null, triage_notes: recent?.triage_notes ?? null, requested_window: "Confirm with customer", status: "needs_review", source: "sms_yes" }, { onConflict: "call_log_id" });
    if (bookingError) throw bookingError;
    return twiml(`<Message>${xmlEscape("Thanks — your request is with the shop. They'll confirm a time shortly. Reply STOP to opt out.")}</Message>`);
  } catch (error) {
    console.error("Twilio SMS handling failed", error instanceof Error ? error.message : "unknown error");
    return twiml("<Message>We couldn't save your request. Please call the shop directly so we can help.</Message>");
  }
}
