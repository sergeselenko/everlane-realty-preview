-- =============================================================================
-- AI Concierge — spend-cap + PII-minimized query-log substrate  (re-website #149, Wave 3)
-- Owned Supabase store: iavsouedogroqzwmccwy
--
-- STAGED, NOT APPLIED. The Supabase MCP is disconnected this build; apply this
-- via the deploy runbook (build/wave-3/concierge-deploy-runbook.md) step 2.
--
-- POSTURE (matches the owned store's proven anon-deny stance):
--   * RLS is ENABLED on every table with NO anon/authenticated policy → default
--     deny. The edge function reaches these tables ONLY through the SECURITY
--     DEFINER RPCs below (execute granted to service_role, revoked from public).
--   * The query log is PII-MINIMIZED: it stores CATEGORY ONLY by default
--     (query_scrubbed stays NULL). The scrubbed free-text query is written only
--     when the operator sets CONCIERGE_LOG_QUERY_TEXT=true — a user can
--     self-disclose a protected class in the query, and a regex scrub is
--     best-effort, never a guarantee. Never the answer, never a transcript,
--     never a raw name/email/phone/address; session id is hashed. Retention
--     30–90 days via concierge_purge_query_log.
--   * Spend is metered against a hard $50/month + $5/day ceiling and ~20
--     turns/session, PLUS a per-IP griefing throttle (the session cap alone is
--     void against a client that rotates the client-supplied sessionId).
--   * PESSIMISTIC METERING (spend-cap integrity): precheck RESERVES a worst-case
--     per-turn cost up front and record_spend RECONCILES it down to the actual.
--     So if the edge invocation is killed after Anthropic charges but before the
--     record (or record_spend itself fails), the worst-case stays booked and the
--     cap keeps binding — it never silently stops metering. The reservation also
--     closes the precheck-before / record-after concurrent-boundary overshoot.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · spend counters (period × cost/turns) — the hard-cap ledger
-- ---------------------------------------------------------------------------
create table if not exists public.concierge_spend (
  period_type text not null check (period_type in ('day','month')),
  period_key  text not null,                 -- 'YYYY-MM-DD' (day) | 'YYYY-MM' (month), UTC
  cost_usd    numeric(12,6) not null default 0,
  turns       integer not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (period_type, period_key)
);

-- ---------------------------------------------------------------------------
-- 2 · per-session turn counter — the ~20-turns/session rate limit
-- ---------------------------------------------------------------------------
create table if not exists public.concierge_session (
  session_id text primary key,               -- random client UUID (no PII)
  turns      integer not null default 0,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2b · per-IP griefing throttle (rolling window) — sessionId rotation defeats
--      the per-session cap; the IP throttle is the abuse layer behind it.
-- ---------------------------------------------------------------------------
create table if not exists public.concierge_ip (
  ip           text primary key,          -- forwarded client IP
  window_start timestamptz not null default now(),
  turns        integer not null default 0
);

-- ---------------------------------------------------------------------------
-- 3 · query log — PII-MINIMIZED (category-only by default), NO transcripts. 30–90d.
-- ---------------------------------------------------------------------------
create table if not exists public.concierge_query_log (
  id             bigint generated always as identity primary key,
  ts             timestamptz not null default now(),
  session_hash   text,                        -- sha256(session_id) — decoupled
  category       text,                        -- coarse: flood/insurance/tax/neighborhood/process/inventory/other
  query_scrubbed text,                        -- user question, PII-redacted + length-capped
  answered       boolean not null default false,
  suppressed     boolean not null default false,  -- guard tripwire or judge suppressed a draft
  route          text,                        -- 'search' | 'contact' | null
  model          text,
  cost_usd       numeric(12,6) not null default 0,
  tokens_in      integer not null default 0,
  tokens_out     integer not null default 0
);
create index if not exists concierge_query_log_ts_idx on public.concierge_query_log (ts);

-- ---------------------------------------------------------------------------
-- RLS: enable everywhere, NO policies → default-deny for anon/authenticated.
-- service_role bypasses RLS; the SECURITY DEFINER RPCs are the only sanctioned
-- write path. (Belt to the service-role suspenders.)
-- ---------------------------------------------------------------------------
alter table public.concierge_spend      enable row level security;
alter table public.concierge_session    enable row level security;
alter table public.concierge_ip         enable row level security;
alter table public.concierge_query_log  enable row level security;

-- Hard-revoke direct table access from the browser-reachable roles.
revoke all on public.concierge_spend      from anon, authenticated;
revoke all on public.concierge_session    from anon, authenticated;
revoke all on public.concierge_ip         from anon, authenticated;
revoke all on public.concierge_query_log  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC · precheck (atomic): caps + IP throttle, reserve a turn, RESERVE cost.
--   Caps are passed in from the edge function env so the operator tunes them
--   without a migration ($50/mo hard, $5/day, ~20 turns/session, per-IP window).
--   p_reserve is the worst-case per-turn cost booked NOW (pessimistic metering,
--   reconciled down by concierge_record_spend). Order: spend caps → IP throttle
--   → session turn → reserve cost (nothing reserved unless every gate passes).
-- ---------------------------------------------------------------------------
create or replace function public.concierge_precheck(
  p_session          text,
  p_ip               text,
  p_day_cap          numeric,
  p_month_cap        numeric,
  p_session_turn_cap integer,
  p_ip_turn_cap      integer,
  p_ip_window_min    integer,
  p_reserve          numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day_key    text := to_char((now() at time zone 'utc'), 'YYYY-MM-DD');
  v_month_key  text := to_char((now() at time zone 'utc'), 'YYYY-MM');
  v_day_spend  numeric := 0;
  v_mon_spend  numeric := 0;
  v_turns      integer := 0;
  v_ip_turns   integer := 0;
begin
  select coalesce(cost_usd,0) into v_day_spend from public.concierge_spend where period_type='day'   and period_key=v_day_key;
  select coalesce(cost_usd,0) into v_mon_spend from public.concierge_spend where period_type='month' and period_key=v_month_key;

  if v_mon_spend >= p_month_cap then
    return jsonb_build_object('allowed', false, 'reason', 'month_cap', 'day_spend', v_day_spend, 'month_spend', v_mon_spend);
  end if;
  if v_day_spend >= p_day_cap then
    return jsonb_build_object('allowed', false, 'reason', 'day_cap', 'day_spend', v_day_spend, 'month_spend', v_mon_spend);
  end if;

  -- per-IP griefing throttle (rolling window). Skipped only if no IP was supplied.
  if p_ip is not null and p_ip <> '' then
    insert into public.concierge_ip as x (ip, window_start, turns)
      values (p_ip, now(), 1)
    on conflict (ip) do update
      set turns = case when x.window_start < now() - make_interval(mins => p_ip_window_min) then 1 else x.turns + 1 end,
          window_start = case when x.window_start < now() - make_interval(mins => p_ip_window_min) then now() else x.window_start end
    returning x.turns into v_ip_turns;
    if v_ip_turns > p_ip_turn_cap then
      return jsonb_build_object('allowed', false, 'reason', 'ip_cap', 'ip_turns', v_ip_turns);
    end if;
  end if;

  -- reserve the turn for this session
  insert into public.concierge_session as s (session_id, turns, last_seen)
    values (p_session, 1, now())
  on conflict (session_id) do update
    set turns = s.turns + 1, last_seen = now()
  returning turns into v_turns;
  if v_turns > p_session_turn_cap then
    return jsonb_build_object('allowed', false, 'reason', 'session_cap', 'session_turns', v_turns);
  end if;

  -- RESERVE worst-case cost now (day + month). turns++ here; record_spend does NOT
  -- touch turns (it only reconciles cost), so the turn is counted exactly once.
  insert into public.concierge_spend as sp (period_type, period_key, cost_usd, turns, updated_at)
    values ('day', v_day_key, p_reserve, 1, now())
  on conflict (period_type, period_key) do update
    set cost_usd = sp.cost_usd + p_reserve, turns = sp.turns + 1, updated_at = now();
  insert into public.concierge_spend as sp (period_type, period_key, cost_usd, turns, updated_at)
    values ('month', v_month_key, p_reserve, 1, now())
  on conflict (period_type, period_key) do update
    set cost_usd = sp.cost_usd + p_reserve, turns = sp.turns + 1, updated_at = now();

  return jsonb_build_object('allowed', true, 'reason', 'ok', 'day_spend', v_day_spend, 'month_spend', v_mon_spend, 'session_turns', v_turns);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC · reconcile the reserved worst-case cost down to the ACTUAL cost.
--   The worst-case p_reserved was booked at precheck; adjust by (actual - reserved).
--   If this never runs (mid-turn kill / RPC failure), the worst-case stays booked
--   and the cap keeps binding — spend-cap integrity does not depend on this call.
-- ---------------------------------------------------------------------------
create or replace function public.concierge_record_spend(p_cost numeric, p_reserved numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day_key   text := to_char((now() at time zone 'utc'), 'YYYY-MM-DD');
  v_month_key text := to_char((now() at time zone 'utc'), 'YYYY-MM');
begin
  update public.concierge_spend set cost_usd = greatest(cost_usd + (p_cost - p_reserved), 0), updated_at = now()
    where period_type='day'   and period_key=v_day_key;
  update public.concierge_spend set cost_usd = greatest(cost_usd + (p_cost - p_reserved), 0), updated_at = now()
    where period_type='month' and period_key=v_month_key;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC · retention purge (30–90d). Schedule via pg_cron at deploy (runbook).
-- ---------------------------------------------------------------------------
create or replace function public.concierge_purge_query_log(p_days integer default 60)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_deleted integer;
begin
  delete from public.concierge_query_log where ts < now() - make_interval(days => p_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Only the server-side edge function (service_role) may call the RPCs.
-- NOTE: `revoke ... from public` alone is NOT enough on Supabase — pg_default_acl
-- grants EXECUTE on every new public function to anon + authenticated DIRECTLY
-- (not via PUBLIC), so those explicit grants must ALSO be revoked or these
-- SECURITY DEFINER RPCs stay anon-callable (a browser client could zero the spend
-- ledger via concierge_record_spend / wipe the query log via _purge). Revoke from
-- public AND the two browser-reachable roles, mirroring the table revokes above.
revoke all on function public.concierge_precheck(text, text, numeric, numeric, integer, integer, integer, numeric)   from public, anon, authenticated;
revoke all on function public.concierge_record_spend(numeric, numeric)                                                from public, anon, authenticated;
revoke all on function public.concierge_purge_query_log(integer)                                                      from public, anon, authenticated;
grant execute on function public.concierge_precheck(text, text, numeric, numeric, integer, integer, integer, numeric) to service_role;
grant execute on function public.concierge_record_spend(numeric, numeric)                                             to service_role;
grant execute on function public.concierge_purge_query_log(integer)                                                   to service_role;
