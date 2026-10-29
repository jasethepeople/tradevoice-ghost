import { sendFallbackTextOnce } from "@/lib/fallback-sms";
import { getAdminDb, publicUrl, twiml, verifyTwilioRequest, xmlEscape } from "@/lib/server";

function formValues(form: FormData) {
  return Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
}

function voicemail(message: string) {
  return `<Say>${xmlEscape(message)}</Say><Record action="${xmlEscape(publicUrl("/api/twilio/voicemail"))}" method="POST" maxLength="120" playBeep="true" finishOnKey="#" />`;
}

export async function POST(request: Request) {
  const values = formValues(await request.formData());
  if (!verifyTwilioRequest(request, values)) return new Response("Invalid signature", { status: 401 });
  const callSid = values.CallSid ?? "";
  const caller = (values.From ?? "").replace(/[^+\d]/g, "");
  const dialed = (values.To ?? "").replace(/[^+\d]/g, "");
  const status = values.DialCallStatus ?? "failed";
  const duration = Math.max(0, Number.parseInt(values.DialCallDuration ?? "0", 10) || 0);
  try {
    const db = getAdminDb();
    const { error: settleError } = await db.rpc("settle_tradevoice_call", { p_twilio_call_sid: callSid, p_duration_seconds: duration, p_status: status.toLowerCase() });
    if (settleError) throw settleError;
    const { data: call, error: callError } = await db.from("call_logs").select("id,business_id,fallback_sms_sent_at").eq("twilio_call_sid", callSid).maybeSingle();
    if (callError) throw callError;
    if (status.toLowerCase() === "completed") return twiml("<Hangup/>");
    if (call && caller && !call.fallback_sms_sent_at) {
      await sendFallbackTextOnce(db, call.business_id, callSid, caller, dialed);
    }
    return twiml(voicemail("Sorry, we couldn't connect you with the shop. Leave your name, service address, and what you need help with after the tone, and we'll call you back."));
  } catch (error) {
    console.error("Twilio call completion failed", error instanceof Error ? error.message : "unknown error");
    return twiml(`<Say>${xmlEscape("Sorry, we couldn't connect you. Please call again in a moment.")}</Say><Hangup/>`);
  }
}
