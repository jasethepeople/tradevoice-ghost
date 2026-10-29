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
  try {
    const db = getAdminDb();
    const { data: line, error: lineError } = await db.from("business_numbers").select("business_id,retell_sip_uri").eq("phone_number", dialed).eq("active", true).maybeSingle();
    if (lineError) throw lineError;
    if (!line) return twiml(voicemail("Thanks for calling. We can't answer right now. Leave your name, address, and what you need help with, and the shop will call you back."));
    const { data: reservation, error: reserveError } = await db.rpc("reserve_tradevoice_call", { p_business_id: line.business_id, p_twilio_call_sid: callSid });
    if (reserveError) throw reserveError;
    const reservedMinutes = Number(reservation) || 0;
    if (!reservedMinutes) {
      await db.from("call_logs").upsert({ business_id: line.business_id, twilio_call_sid: callSid, caller_phone: caller, business_phone: dialed, status: "Missed", issue: "Monthly minute cap reached", source: "twilio", updated_at: new Date().toISOString() }, { onConflict: "twilio_call_sid" });
      return twiml(voicemail("We have reached this month's receptionist minutes. Leave your name, address, and what you need help with, and the shop will call you back."));
    }
    const { error: startError } = await db.from("call_logs").upsert({ business_id: line.business_id, twilio_call_sid: callSid, caller_phone: caller, business_phone: dialed, status: "in_progress", source: "twilio", updated_at: new Date().toISOString() }, { onConflict: "twilio_call_sid" });
    if (startError) throw startError;
    const sipUri = String(line.retell_sip_uri ?? "");
    if (!/^sips?:[^\s<>]+$/i.test(sipUri)) {
      await db.rpc("release_tradevoice_call", { p_twilio_call_sid: callSid });
      throw new Error("The Retell SIP address is missing or invalid for this phone number.");
    }
    const action = xmlEscape(publicUrl("/api/twilio/call-result"));
    const remainingSeconds = Math.min(900, reservedMinutes * 60);
    return twiml(`<Dial action="${action}" method="POST" timeout="20" timeLimit="${remainingSeconds}" answerOnBridge="true"><Sip>${xmlEscape(sipUri)}</Sip></Dial>`, 200);
  } catch (error) {
    console.error("Twilio inbound call routing failed", error instanceof Error ? error.message : "unknown error");
    return twiml(voicemail("Thanks for calling. Our receptionist is temporarily unavailable. Leave your name, address, and what you need help with, and the shop will call you back."));
  }
}
