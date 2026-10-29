import { getAdminDb, getTwilioClient, sendCustomerSms, twiml, verifyTwilioRequest } from "@/lib/server";

function formValues(form: FormData) {
  return Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
}

export async function POST(request: Request) {
  const values = formValues(await request.formData());
  if (!verifyTwilioRequest(request, values)) return new Response("Invalid signature", { status: 401 });
  const callSid = values.CallSid ?? "";
  const recordingUrl = values.RecordingUrl ?? "";
  const caller = (values.From ?? "").replace(/[^+\d]/g, "");
  const dialed = (values.To ?? "").replace(/[^+\d]/g, "");
  try {
    const db = getAdminDb();
    const { data: call, error } = await db.from("call_logs").select("id,business_id").eq("twilio_call_sid", callSid).maybeSingle();
    if (error) throw error;
    if (call) {
      await db.from("call_logs").update({ status: "voicemail", recording_url: recordingUrl || null, duration_seconds: Number(values.RecordingDuration) || 0, updated_at: new Date().toISOString() }).eq("id", call.id);
      const { data: business } = await db.from("businesses").select("owner_phone").eq("id", call.business_id).single();
      if (business?.owner_phone) {
        const twilio = getTwilioClient();
        await twilio.messages.create({ to: business.owner_phone, from: dialed, body: `TradeVoice Ghost: a caller left a voicemail at ${dialed}. Review the private call dashboard.` });
      }
      if (caller) {
        const { data: consent } = await db.from("sms_consents").select("opted_in").eq("business_id", call.business_id).eq("phone_number", caller).maybeSingle();
        if (consent?.opted_in) await sendCustomerSms(caller, dialed, "Thanks for leaving a message. The shop has your request and will follow up. Reply STOP to opt out.");
      }
    }
  } catch (error) {
    console.error("Twilio voicemail processing failed", error instanceof Error ? error.message : "unknown error");
  }
  return twiml("<Hangup/>");
}
