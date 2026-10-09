-- STAGING ONLY: run before and after candidate 0002 on the same disposable
-- staging dataset/compute. Do not execute against production.
-- Requires a disposable active conversation and its real sender; no rows persist.
-- Repeat 20 times; compare median Execution Time (not browser/network latency).
-- Replace the two UUID placeholders with staging fixture IDs only.
begin;
explain (analyze, buffers, format json)
insert into public.direct_messages(conversation_id,sender_profile_id,body)
values ('00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-000000000000','Staging latency fixture');
rollback;
-- Run with the same role/JWT claims used by the staging integration fixture.
-- Retain both plans, job cardinality, compute size and role with the handoff.
