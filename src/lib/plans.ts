export const plans = {
  starter: { label: "Ghost 100", price: 49, minutes: 100, numbers: 1, jobberSync: false, priorityTriage: false },
  growth: { label: "Ghost 300", price: 99, minutes: 300, numbers: 1, jobberSync: true, priorityTriage: false },
  pro: { label: "Ghost 800", price: 199, minutes: 800, numbers: 2, jobberSync: true, priorityTriage: true },
} as const;

export type PlanId = keyof typeof plans;

export function planForId(value: unknown): PlanId {
  return value === "growth" || value === "pro" ? value : "starter";
}
