create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  trade text not null check (trade in ('HVAC', 'Plumbing', 'Electrical')),
  plan_id text not null default 'starter' check (plan_id in ('starter', 'growth', 'pro')),
  owner_phone text,
  average_job_value numeric(10,2) not null default 620 check (average_job_value >= 0),
  voice_cost_per_minute numeric(8,5) not null default 0 check (voice_cost_per_minute >= 0),
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text not null default 'trialing',
  billing_period_start timestamptz not null default date_trunc('month', now()),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_numbers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  phone_number text not null unique,
  twilio_sid text unique,
  retell_sip_uri text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  retell_call_id text unique,
  twilio_call_sid text unique,
  twilio_status text,
  twilio_settled_at timestamptz,
  caller_phone text,
  business_phone text,
  customer_name text,
  address text,
  trade text,
  issue text,
  emergency_level text not null default 'low' check (emergency_level in ('low', 'medium', 'high')),
  status text not null default 'in_progress',
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  billable_minutes integer not null default 0 check (billable_minutes >= 0),
  provider_cost_usd numeric(10,5) not null default 0 check (provider_cost_usd >= 0),
  recording_url text,
  transcript text,
  triage_notes text,
  disconnection_reason text,
  source text not null default 'retell',
  call_started_at timestamptz,
  owner_alerted_at timestamptz,
  fallback_sms_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists call_logs_business_created_idx on public.call_logs (business_id, created_at desc);
create index if not exists call_logs_business_month_idx on public.call_logs (business_id, call_started_at desc);

create table if not exists public.minute_reservations (
  twilio_call_sid text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  reserved_minutes integer not null check (reserved_minutes > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  call_log_id uuid unique references public.call_logs(id) on delete set null,
  customer_name text not null default 'Caller',
  customer_phone text not null,
  address text,
  trade text,
  issue text not null,
  triage_notes text,
  requested_window text not null default 'Next available',
  status text not null default 'needs_review' check (status in ('needs_review', 'urgent_review', 'approved', 'synced', 'sync_failed')),
  source text not null default 'retell',
  crm_provider text check (crm_provider in ('jobber', 'housecallpro')),
  crm_external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sms_consents (
  business_id uuid not null references public.businesses(id) on delete cascade,
  phone_number text not null,
  opted_in boolean not null default false,
  consent_source text,
  updated_at timestamptz not null default now(),
  primary key (business_id, phone_number)
);

create table if not exists public.stripe_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

create or replace function public.reserve_tradevoice_call(p_business_id uuid, p_twilio_call_sid text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_subscription_status text;
  v_period_start timestamptz;
  v_cap integer;
  v_used integer;
  v_reserved integer;
  v_available integer;
  v_minutes integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text, 0));
  select plan_id, subscription_status, billing_period_start into v_plan, v_subscription_status, v_period_start
    from public.businesses where id = p_business_id for update;
  if v_plan is null or v_subscription_status not in ('active', 'trialing') then return 0; end if;
  delete from public.minute_reservations where created_at < now() - interval '20 minutes';
  if v_plan = 'growth' then v_cap := 300;
  elsif v_plan = 'pro' then v_cap := 800;
  else v_cap := 100;
  end if;
  select reserved_minutes into v_minutes from public.minute_reservations where twilio_call_sid = p_twilio_call_sid;
  if v_minutes is not null then return v_minutes; end if;
  select coalesce(sum(billable_minutes), 0) into v_used
    from public.call_logs
    where business_id = p_business_id and coalesce(call_started_at, created_at) >= v_period_start;
  select coalesce(sum(reserved_minutes), 0) into v_reserved
    from public.minute_reservations
    where business_id = p_business_id;
  v_available := v_cap - v_used - v_reserved;
  if v_available < 1 then return 0; end if;
  v_minutes := least(15, v_available);
  insert into public.minute_reservations (twilio_call_sid, business_id, reserved_minutes)
    values (p_twilio_call_sid, p_business_id, v_minutes)
    on conflict (twilio_call_sid) do nothing;
  return v_minutes;
end;
$$;

create or replace function public.release_tradevoice_call(p_twilio_call_sid text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.minute_reservations where twilio_call_sid = p_twilio_call_sid;
$$;

create or replace function public.settle_tradevoice_call(p_twilio_call_sid text, p_duration_seconds integer, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_reserved integer;
  v_seconds integer;
begin
  select business_id, reserved_minutes into v_business_id, v_reserved
    from public.minute_reservations where twilio_call_sid = p_twilio_call_sid for update;
  if v_business_id is null then return; end if;
  v_seconds := least(greatest(coalesce(p_duration_seconds, 0), 0), v_reserved * 60);
  insert into public.call_logs (business_id, twilio_call_sid, twilio_status, twilio_settled_at, status, duration_seconds, billable_minutes, source, updated_at)
    values (v_business_id, p_twilio_call_sid, coalesce(p_status, 'completed'), now(), coalesce(p_status, 'completed'), v_seconds, ceil(v_seconds / 60.0)::integer, 'twilio', now())
    on conflict (twilio_call_sid) do update set
      twilio_status = excluded.twilio_status,
      twilio_settled_at = now(),
      status = case when public.call_logs.status in ('in_progress', 'Missed', 'missed') then excluded.status else public.call_logs.status end,
      duration_seconds = excluded.duration_seconds,
      billable_minutes = excluded.billable_minutes,
      updated_at = now();
  delete from public.minute_reservations where twilio_call_sid = p_twilio_call_sid;
end;
$$;

create or replace function public.claim_tradevoice_fallback_sms(p_twilio_call_sid text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.call_logs set fallback_sms_sent_at = now(), updated_at = now()
    where twilio_call_sid = p_twilio_call_sid and fallback_sms_sent_at is null
    returning id into v_id;
  return v_id is not null;
end;
$$;

revoke all on function public.reserve_tradevoice_call(uuid, text) from public, anon, authenticated;
revoke all on function public.release_tradevoice_call(text) from public, anon, authenticated;
revoke all on function public.settle_tradevoice_call(text, integer, text) from public, anon, authenticated;
revoke all on function public.claim_tradevoice_fallback_sms(text) from public, anon, authenticated;
grant execute on function public.reserve_tradevoice_call(uuid, text) to service_role;
grant execute on function public.release_tradevoice_call(text) to service_role;
grant execute on function public.settle_tradevoice_call(text, integer, text) to service_role;
grant execute on function public.claim_tradevoice_fallback_sms(text) to service_role;

alter table public.businesses enable row level security;
alter table public.business_numbers enable row level security;
alter table public.call_logs enable row level security;
alter table public.minute_reservations enable row level security;
alter table public.booking_requests enable row level security;
alter table public.sms_consents enable row level security;
alter table public.stripe_events enable row level security;

revoke all on public.businesses, public.business_numbers, public.call_logs, public.minute_reservations, public.booking_requests, public.sms_consents, public.stripe_events from anon, authenticated;
grant select on public.businesses, public.business_numbers, public.call_logs, public.booking_requests, public.sms_consents to authenticated;
grant update (name, trade, owner_phone, average_job_value, voice_cost_per_minute, updated_at) on public.businesses to authenticated;
grant update (status, requested_window, updated_at) on public.booking_requests to authenticated;

drop policy if exists "Business owners can read their business" on public.businesses;
drop policy if exists "Business owners can update their business" on public.businesses;
drop policy if exists "Business owners can read their numbers" on public.business_numbers;
drop policy if exists "Business owners can read their calls" on public.call_logs;
drop policy if exists "Business owners can read their booking requests" on public.booking_requests;
drop policy if exists "Business owners can update their booking requests" on public.booking_requests;
drop policy if exists "Business owners can read their text consent state" on public.sms_consents;



create policy "Business owners can read their business" on public.businesses for select using (auth.uid() = owner_user_id);
create policy "Business owners can update their business" on public.businesses for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create policy "Business owners can read their numbers" on public.business_numbers for select using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()));
create policy "Business owners can read their calls" on public.call_logs for select using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()));
create policy "Business owners can read their booking requests" on public.booking_requests for select using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()));
create policy "Business owners can update their booking requests" on public.booking_requests for update using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid())) with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()));
create policy "Business owners can read their text consent state" on public.sms_consents for select using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_user_id = auth.uid()));
