-- Administrator-run regression. All fixtures and notifications roll back.
begin;
insert into auth.users(id) values
 ('90000000-0000-4000-8000-000000000001'),
 ('90000000-0000-4000-8000-000000000002'),
 ('90000000-0000-4000-8000-000000000003');
insert into public.profiles(id,account_id,name,handle,headline,is_private) values
 ('91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','Test creator','save_test_owner','Rollback-only test',false),
 ('91000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000002','Test viewer','save_test_viewer','Rollback-only test',false),
 ('91000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000003','Private creator','save_test_private','Rollback-only test',true);
insert into public.portfolio_categories(id,profile_id,label) values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','Save test');
insert into public.projects(id,profile_id,category_id,title,summary) values
 ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Save test','Rollback-only test');

select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$
begin
  perform public.set_creator_save('91000000-0000-4000-8000-000000000001',true);
  perform public.set_creator_save('91000000-0000-4000-8000-000000000001',true);
  if (select count(*) from public.creator_saves) <> 1 then raise exception 'Duplicate saves'; end if;
  if exists(select 1 from public.profile_follows) then raise exception 'Saving changed following'; end if;
  begin
    perform public.set_creator_save('91000000-0000-4000-8000-000000000002',true);
    raise exception 'Self-save allowed';
  exception when raise_exception then
    if sqlerrm <> 'You cannot save your own profile.' then raise; end if;
  end;
  begin
    perform public.set_creator_save('91000000-0000-4000-8000-000000000003',true);
    raise exception 'Private profile saved without access';
  exception when raise_exception then
    if sqlerrm <> 'This profile is unavailable.' then raise; end if;
  end;
  begin
    insert into public.creator_saves(account_id,profile_id) values
      ('90000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001');
    raise exception 'Spoofed account insert allowed';
  exception when insufficient_privilege then null;
  end;
  insert into public.project_engagement(account_id,project_id,kind) values
    (auth.uid(),'93000000-0000-4000-8000-000000000001','save');
end;
$$;

reset role;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
declare counts jsonb;
begin
  if exists(select 1 from public.creator_saves) then raise exception 'Creator can see saver identities'; end if;
  counts := public.creator_save_insights();
  if counts <> '{"creatorSaves":1,"projectSaves":1,"followers":0}'::jsonb then raise exception 'Wrong owner totals: %', counts; end if;
  if exists(select 1 from public.notifications) then raise exception 'Saving sent a notification'; end if;
  delete from public.creator_saves where profile_id = '91000000-0000-4000-8000-000000000001';
  if (public.creator_save_insights()->>'creatorSaves')::int <> 1 then raise exception 'Creator deleted someone else''s save'; end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$
begin
  if exists(select 1 from public.creator_saves) then raise exception 'Third party can read library'; end if;
  if public.creator_save_insights() <> '{"creatorSaves":0,"projectSaves":0,"followers":0}'::jsonb then raise exception 'Insights leaked another creator''s totals'; end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.set_creator_save('91000000-0000-4000-8000-000000000001',false);
select public.set_creator_save('91000000-0000-4000-8000-000000000001',false);
select public.set_creator_save('91000000-0000-4000-8000-000000000001',true);
reset role;
update public.profiles set is_private=true where id='91000000-0000-4000-8000-000000000001';
set local role authenticated;
select public.set_creator_save('91000000-0000-4000-8000-000000000001',false);
do $$ begin
  if exists(select 1 from public.creator_saves) then raise exception 'Cannot unsave an inaccessible creator'; end if;
end; $$;

reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
  begin
    perform public.creator_save_insights();
    raise exception 'Anonymous insights allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_creator_save('91000000-0000-4000-8000-000000000001',true);
    raise exception 'Anonymous save allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.creator_saves;
    raise exception 'Anonymous library read allowed';
  exception when insufficient_privilege then null;
  end;
end; $$;
rollback;
select 'PASS: unique saves, ownership, RLS, private counts, unfollow independence, removal, anonymous denial; fixtures rolled back' as result;
