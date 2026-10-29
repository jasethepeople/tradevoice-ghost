import Stripe from "stripe";
import { planForId } from "@/lib/plans";
import { getAdminDb } from "@/lib/server";

function stripeId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function billingPeriodStart(subscription: Stripe.Subscription): number {
  return subscription.items.data[0]?.current_period_start ?? subscription.billing_cycle_anchor;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!signature || !secret || !apiKey) return Response.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = new Stripe(apiKey).webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const { data: seen, error: lookupError } = await db.from("stripe_events").select("event_id").eq("event_id", event.id).maybeSingle();
    if (lookupError) throw lookupError;
    if (seen) return Response.json({ received: true, duplicate: true });

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const businessId = session.metadata?.business_id;
      const planId = session.metadata?.plan_id;
      const subscriptionId = stripeId(session.subscription as string | { id: string } | null);
      const subscription = subscriptionId ? await new Stripe(apiKey).subscriptions.retrieve(subscriptionId) : null;
      if (businessId && planId) {
        const status = subscription?.status ?? (session.payment_status === "paid" || session.payment_status === "no_payment_required" ? "active" : "incomplete");
        const { error } = await db.from("businesses").update({
          plan_id: status === "active" || status === "trialing" ? planForId(planId) : "starter",
          stripe_customer_id: stripeId(session.customer as string | { id: string } | null),
          stripe_subscription_id: subscriptionId,
          subscription_status: status,
          billing_period_start: subscription ? new Date(billingPeriodStart(subscription) * 1000).toISOString() : new Date().toISOString(),
        }).eq("id", businessId);
        if (error) throw error;
      }
    }

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const businessId = subscription.metadata.business_id;
      if (businessId) {
        const active = subscription.status === "active" || subscription.status === "trialing";
        const { error } = await db.from("businesses").update({
          plan_id: active ? planForId(subscription.metadata.plan_id) : "starter",
          subscription_status: subscription.status,
          stripe_customer_id: stripeId(subscription.customer as string | { id: string }),
          stripe_subscription_id: event.type === "customer.subscription.deleted" ? null : subscription.id,
          billing_period_start: new Date(billingPeriodStart(subscription) * 1000).toISOString(),
        }).eq("id", businessId);
        if (error) throw error;
      }
    }

    const { error: eventError } = await db.from("stripe_events").insert({ event_id: event.id, event_type: event.type });
    if (eventError && eventError.code !== "23505") throw eventError;
    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Webhook processing failed." }, { status: 503 });
  }
}
