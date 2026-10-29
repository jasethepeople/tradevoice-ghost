import Stripe from "stripe";
import { plans, planForId } from "@/lib/plans";
import { getAdminDb, publicUrl, requireSetupSecret } from "@/lib/server";

const priceEnv: Record<string, string> = {
  starter: "STRIPE_PRICE_STARTER",
  growth: "STRIPE_PRICE_GROWTH",
  pro: "STRIPE_PRICE_PRO",
};

export async function POST(request: Request) {
  if (!requireSetupSecret(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let payload: { businessId?: string; planId?: string };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  if (!payload.businessId || !payload.planId || !(payload.planId in plans)) return Response.json({ error: "Provide a valid business ID and plan." }, { status: 400 });
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env[priceEnv[payload.planId]];
  if (!stripeKey || !priceId) return Response.json({ error: "Stripe secret key and the selected Stripe price ID must be configured." }, { status: 503 });
  try {
    const db = getAdminDb();
    const { data: business, error } = await db.from("businesses").select("id,name,stripe_customer_id").eq("id", payload.businessId).single();
    if (error) throw error;
    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer: business.stripe_customer_id ?? undefined,
      customer_creation: business.stripe_customer_id ? undefined : "always",
      success_url: `${publicUrl("/")}?billing=success`,
      cancel_url: `${publicUrl("/")}?billing=cancel`,
      allow_promotion_codes: true,
      metadata: { business_id: business.id, plan_id: planForId(payload.planId) },
      subscription_data: { metadata: { business_id: business.id, plan_id: planForId(payload.planId) } },
    });
    return Response.json({ url: session.url });
  } catch (error) {
    console.error("Stripe Checkout session failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Could not start Stripe Checkout." }, { status: 502 });
  }
}
