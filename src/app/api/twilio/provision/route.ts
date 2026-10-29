import { plans, planForId } from "@/lib/plans";
import { getAdminDb, getTwilioClient, publicUrl, requireSetupSecret } from "@/lib/server";

export async function POST(request: Request) {
  if (!requireSetupSecret(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let payload: { businessId?: string; phoneNumber?: string; retellSipUri?: string };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const phoneNumber = payload.phoneNumber ?? "";
  const sipUri = payload.retellSipUri ?? "";
  if (!payload.businessId || !/^\+[1-9]\d{7,14}$/.test(phoneNumber) || !/^sips?:[^\s<>]+$/i.test(sipUri)) {
    return Response.json({ error: "Provide a business ID, E.164 phone number, and Retell SIP URI." }, { status: 400 });
  }
  let purchasedSid: string | undefined;
  try {
    const db = getAdminDb();
    const { data: business, error: businessError } = await db.from("businesses").select("plan_id").eq("id", payload.businessId).single();
    if (businessError) throw businessError;
    const plan = plans[planForId(business.plan_id)];
    const { count, error: countError } = await db.from("business_numbers").select("id", { count: "exact", head: true }).eq("business_id", payload.businessId).eq("active", true);
    if (countError) throw countError;
    if ((count ?? 0) >= plan.numbers) return Response.json({ error: `This plan allows ${plan.numbers} active phone number(s).` }, { status: 409 });
    const client = getTwilioClient();
    const number = await client.incomingPhoneNumbers.create({
      phoneNumber,
      voiceUrl: publicUrl("/api/twilio/inbound"),
      voiceMethod: "POST",
      smsUrl: publicUrl("/api/twilio/sms"),
      smsMethod: "POST",
    });
    purchasedSid = number.sid;
    const { error: insertError } = await db.from("business_numbers").insert({ business_id: payload.businessId, phone_number: number.phoneNumber, twilio_sid: number.sid, retell_sip_uri: sipUri, active: true });
    if (insertError) throw insertError;
    return Response.json({ phoneNumber: number.phoneNumber, sid: number.sid, voiceUrl: publicUrl("/api/twilio/inbound") }, { status: 201 });
  } catch (error) {
    if (purchasedSid) {
      try { await getTwilioClient().incomingPhoneNumbers(purchasedSid).remove(); } catch (cleanupError) { console.error("Twilio number cleanup failed", cleanupError instanceof Error ? cleanupError.message : "unknown error"); }
    }
    console.error("Twilio number provisioning failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: error instanceof Error ? error.message : "Twilio provisioning failed." }, { status: 502 });
  }
}
