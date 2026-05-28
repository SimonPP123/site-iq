-- The per-audit chat-message cap was a read-then-write: the route counted role='user' rows, then
-- ran the up-to-45s LLM call, then inserted - so N concurrent requests for one report all observed
-- count<5 before any insert landed and all fired the paid OpenAI call (rate-limit-bounded overspend,
-- the exact ceiling-bypass class 0021 fixed for audits). Make consumption ATOMIC: lock the report
-- row, count, and insert THIS user message in one transaction. Returns the new message id (>0),
-- -1 over cap, or 0 when the caller does not own the report. Keep v_ceiling/cap in sync with
-- FREE_PLAN.chatMessagesPerAudit (src/lib/plan.ts).
create or replace function public.consume_chat_message(p_report_id uuid, p_content text, p_max integer)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_cap   integer := least(coalesce(p_max, 5), 20);  -- absolute ceiling 20; Free = 5
  v_count integer;
  v_id    bigint;
begin
  if v_uid is null then return 0; end if;
  -- Lock the report row to serialize concurrent consumes for THIS report (the count below is then
  -- race-free), and verify ownership in the same step.
  perform 1 from public.reports where id = p_report_id and user_id = v_uid for update;
  if not found then return 0; end if;
  select count(*) into v_count from public.chat_messages where report_id = p_report_id and role = 'user';
  if v_count >= v_cap then return -1; end if;
  insert into public.chat_messages (report_id, role, content)
    values (p_report_id, 'user', left(coalesce(p_content, ''), 4000))
    returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.consume_chat_message(uuid, text, integer) from public;
grant execute on function public.consume_chat_message(uuid, text, integer) to authenticated, service_role;
