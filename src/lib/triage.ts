export type EmergencyLevel = "low" | "medium" | "high";
export type Trade = "HVAC" | "Plumbing" | "Electrical";

export const tradeScripts: Record<Trade, string> = {
  HVAC: "No-cool triage: ask whether the system is blowing air and whether it feels warm or cool; whether the thermostat display is lit; and whether the caller has noticed a tripped breaker. Do not tell callers to open equipment or handle wiring. If there is a gas odor, CO alarm, smoke, or a medical concern, tell them to leave the area and contact emergency services.",
  Plumbing: "Leak triage: ask where water is visible, whether it is actively spreading, whether the floor is warm, whether the water meter moves while fixtures are off, and whether water is near electrical equipment. If safe and already familiar with it, the caller may use the home's main water shutoff; never ask them to enter standing water or touch electrical equipment. Escalate active flooding and water near electricity immediately.",
  Electrical: "Electrical safety triage: ask whether there is smoke, fire, a burning smell, visible sparks, heat, or anyone shocked. Do not ask the caller to open a panel, touch wiring, or repeatedly reset a breaker. For smoke, fire, shock, or an active electrical hazard, tell them to get to safety and contact emergency services, then alert the owner.",
};

const highRisk = /\b(?:active fire|fire|smoke|sparks?|burning smell|gas leak|smell(?:s|ed)? of gas|carbon monoxide|co alarm|co detector|electrical shock|shocked by (?:an )?outlet|live wire|water (?:is )?(?:pouring|flooding|spreading)|flood(?:ing)?|water (?:is )?near (?:an? )?(?:outlet|electrical panel|breaker))\b/gi;
const mediumRisk = /\b(?:slab leak|warm (?:floor|spot|patch (?:on|in) (?:the )?floor)|water meter (?:is )?(?:still )?moving|leak(?:ing)?|no hot water|no[- ]cool|not cooling|breaker (?:keeps )?tripping|no airflow|thermostat.{0,30}blank)\b/gi;
const negativeLead = /\b(?:no|not|never|without|denies?|deny|doesn't|don't|isn't|aren't|didn't)\b/i;

function hasPositiveMatch(text: string, pattern: RegExp): boolean {
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    const start = Math.max(text.lastIndexOf(".", index), text.lastIndexOf("!", index), text.lastIndexOf("?", index), text.lastIndexOf(";", index), index - 42) + 1;
    const prefix = text.slice(start, index).split(/\b(?:but|however)\b/i).at(-1) ?? "";
    if (!negativeLead.test(prefix)) return true;
  }
  return false;
}

export function classifyEmergency(text: string, supplied?: unknown): EmergencyLevel {
  const explicit = typeof supplied === "string" ? supplied.toLowerCase().trim() : "";
  const normalized = text.toLowerCase();
  if (hasPositiveMatch(normalized, highRisk)) return "high";
  if (explicit === "high") return "high";
  if (hasPositiveMatch(normalized, mediumRisk)) return "medium";
  if (explicit === "medium") return "medium";
  return "low";
}
