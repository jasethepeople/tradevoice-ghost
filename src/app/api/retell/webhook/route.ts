import { classifyEmergency } from "@/lib/triage";
import { isDroppedCall, verifyRetellSignature } from "@/lib/retell";
import { sendFallbackTextOnce } from "@/lib/fallback-sms";
import { alertOwner, getAdminDb } from "@/lib/server";

type RetellCall = {
  call_id?: string;
  from_number?: string;
  to_number?: string;
  call_status?: string;
  disconnection_reason?: string;
  duration_ms?: number;
  start_timestamp?: number;
  end_timestamp?: number;
  transcript?: string;
  transcript_object?: Array<{ role?: string; content?: string }>;
  recording_url?: string;
  telephony_identifier?: { twilio_call_sid?: string };
  call_analysis?: {
    call_summary?: string;
    call_successful?: boolean;
    custom_analysis_data?: Record<string, unknown>;
  };
};

type RetellWebhook = { event?: string; call?: RetellCall };

function cleanPhone(value: string | undefined) {
  return (value ?? "").replace(/[^+\d]/g, "");
}

function asText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getTranscript(call: RetellCall) {
  if (typeof call.transcript === "string") return call.transcript;
  return (call.transcript_object ?? []).map((line) => `${line.role ?? ""}: ${line.content ?? ""}`).join("\n");
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyRetellSignature(rawBody, request.headers.get("x-retell-signature"))) return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
  let payload: RetellWebhook;
  try {
    payload = JSON.parse(rawBody) as RetellWebhook;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const call = payload.call;
  if (!call?.call_id || (payload.event !== "call_ended" && payload.event !== "call_analyzed")) return Response.json({ received: true });

  const caller = cleanPhone(call.from_number);
  const businessPhone = cleanPhone(call.to_number);
  const twilioCallSid = call.telephony_identifier?.twilio_call_sid ?? null;
  const transcript = getTranscript(call).slice(0, 40000);
  const analysis = call.call_analysis?.custom_analysis_data ?? {};
  const severity = classifyEmergency(transcript, analysis.emergency_level);
  const summary = asText(call.call_analysis?.call_summary, "Trade service call");
  const issue = asText(analysis.issue, summary);
  const startedAt = typeof call.start_timestamp === "number" ? new Date(call.start_timestamp).toISOString() : new Date().toISOString();
  const durationSeconds = typeof call.duration_ms === "number" ? Math.ceil(call.duration_ms / 1000) : call.start_timestamp && call.end_timestamp ? Math.max(0, Math.ceil((call.end_timestamp - call.start_timestamp) / 1000)) : 0;

  try {
    const db = getAdminDb();
    const { data: line, error: lineError } = await db.from("business_numbers").select("business_id,phone_number").eq("phone_number", businessPhone).eq("active", true).maybeSingle();
    if (lineError) throw lineError;
    if (!line) return Response.json({ received: true, saved: false });
    const { data: business, error: businessError } = await db.from("businesses").select("owner_phone,voice_cost_per_minute").eq("id", line.business_id).single();
    if (businessError) throw businessError;
    const configuredRate = Number(business.voice_cost_per_minute) || Number(process.env.RETELL_COST_PER_MINUTE_USD) || 0;
    const row = {
      business_id: line.business_id,
      retell_call_id: call.call_id,
      twilio_call_sid: twilioCallSid,
      caller_phone: caller || null,
      business_phone: businessPhone || null,
      customer_name: asText(analysis.customer_name, "Caller"),
      address: asText(analysis.service_address, "") || null,
      trade: asText(analysis.trade, "HVAC"),
      issue,
      emergency_level: severity,
      status: severity === "high" || severity === "medium" || analysis.booking_requested === true ? "needs_review" : "resolved",
      triage_notes: transcript.slice(-12000),
      transcript,
      recording_url: call.recording_url ?? null,
      duration_seconds: durationSeconds,
      billable_minutes: Math.ceil(durationSeconds / 60),
      provider_cost_usd: Number(((durationSeconds / 60) * configuredRate).toFixed(4)),
      source: "retell",
      call_started_at: startedAt,
      disconnection_reason: call.disconnection_reason ?? null,
      updated_at: new Date().toISOString(),
    };
    let savedCall: { id: string; owner_alerted_at: string | null; fallback_sms_sent_at: string | null } | null = null;
    if (twilioCallSid) {
      const { data: existing, error } = await db.from("call_logs").select("id,owner_alerted_at,fallback_sms_sent_at,duration_seconds,billable_minutes,twilio_settled_at").eq("twilio_call_sid", twilioCallSid).maybeSingle();
      if (error) throw error;
      if (existing) {
        const updateRow = existing.twilio_settled_at ? { ...row, duration_seconds: existing.duration_seconds, billable_minutes: existing.billable_minutes } : row;
        const { data, error: updateError } = await db.from("call_logs").update(updateRow).eq("id", existing.id).select("id,owner_alerted_at,fallback_sms_sent_at").single();
        if (updateError) throw updateError;
        savedCall = data;
      }
    }
    if (!savedCall) {
      const { data, error } = await db.from("call_logs").upsert(row, { onConflict: "retell_call_id" }).select("id,owner_alerted_at,fallback_sms_sent_at").single();
      if (error) throw error;
      savedCall = data;
    }

    if (analysis.sms_consent === true && caller) {
      const { error } = await db.from("sms_consents").upsert({ business_id: line.business_id, phone_number: caller, opted_in: true, consent_source: "retell_verbal_consent", updated_at: new Date().toISOString() }, { onConflict: "business_id,phone_number" });
      if (error) throw error;
    }
    if (payload.event === "call_analyzed" && (severity === "medium" || severity === "high" || analysis.booking_requested === true)) {
      const { error } = await db.from("booking_requests").upsert({ business_id: line.business_id, call_log_id: savedCall.id, customer_name: asText(analysis.customer_name, "Caller"), customer_phone: caller, trade: asText(analysis.trade, "HVAC"), issue, address: asText(analysis.service_address, "") || null, triage_notes: transcript.slice(-4000), requested_window: severity === "high" ? "Owner to call now" : asText(analysis.requested_window, "Next available day"), status: severity === "high" ? "urgent_review" : "needs_review", source: "retell" }, { onConflict: "call_log_id" });
      if (error) throw error;
    }
    if (payload.event === "call_analyzed" && severity === "high" && business.owner_phone) {
      const alertTime = new Date().toISOString();
      const { data: claimed, error } = await db.from("call_logs").update({ owner_alerted_at: alertTime }).eq("id", savedCall.id).is("owner_alerted_at", null).select("id").maybeSingle();
      if (error) throw error;
      if (claimed) {
        try {
          await alertOwner(business.owner_phone, businessPhone, caller, issue);
        } catch (alertError) {
          await db.from("call_logs").update({ owner_alerted_at: null }).eq("id", savedCall.id).eq("owner_alerted_at", alertTime);
          throw alertError;
        }
      }
    }
    if (isDroppedCall(call.disconnection_reason) && twilioCallSid && caller && !savedCall.fallback_sms_sent_at) {
      await sendFallbackTextOnce(db, line.business_id, twilioCallSid, caller, businessPhone);
    }
    return Response.json({ received: true, saved: true });
  } catch (error) {
    console.error("Retell webhook processing failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
