-- Validate the real profile constraints in a temporary copy. No user records
-- are created or changed, and the transaction always rolls back.
begin;
create temporary table onboarding_profile_validation
  (like public.profiles including all) on commit drop;
insert into onboarding_profile_validation (account_id, name, handle)
  values (gen_random_uuid(), 'New profile', 'profile_test_1');
insert into onboarding_profile_validation (account_id, name, handle, headline)
  values (gen_random_uuid(), 'Existing profile', 'profile_test_2', 'Existing headline');
do $$
begin
  if (select headline from onboarding_profile_validation where handle = 'profile_test_1') <> '' then
    raise exception 'New profiles must accept an omitted headline';
  end if;
  if (select headline from onboarding_profile_validation where handle = 'profile_test_2') <> 'Existing headline' then
    raise exception 'Existing headlines must be preserved';
  end if;
  begin
    insert into onboarding_profile_validation (account_id, name, handle, headline)
      values (gen_random_uuid(), 'Invalid profile', 'profile_test_3', repeat('x', 81));
    raise exception 'Overlong headlines must still be rejected';
  exception when check_violation then null;
  end;
end;
$$;
rollback;
