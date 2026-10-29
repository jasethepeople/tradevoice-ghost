import type { SupabaseClient } from "@supabase/supabase-js";
import { sendCustomerSms } from "@/lib/server";

export async function sendFallbackTextOnce(db: SupabaseClient, businessId: string, callSid: string, to: string, from: string) {
  const { data: consent, error: consentError } = await db.from("sms_consents").select("opted_in").eq("business_id", businessId).eq("phone_number", to).maybeSingle();
  if (consentError) throw consentError;
  if (!consent?.opted_in) return false;
  const { data: claimed, error: claimError } = await db.rpc("claim_tradevoice_fallback_sms", { p_twilio_call_sid: callSid });
  if (claimError) throw claimError;
  if (!claimed) return false;
  try {
    await sendCustomerSms(to, from, "Sorry we got disconnected. Reply YES and the shop will follow up to confirm a service visit. Reply STOP to opt out.");
    return true;
  } catch (error) {
    await db.from("call_logs").update({ fallback_sms_sent_at: null, updated_at: new Date().toISOString() }).eq("twilio_call_sid", callSid);
    throw error;
  }
}
