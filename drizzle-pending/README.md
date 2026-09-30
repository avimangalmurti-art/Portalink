# Unapproved Sites/D1 migrations

Sites packages the entire `drizzle/` directory and applies its migrations during
deployment. Keep approval-only candidates here until the user explicitly
approves their database changes. Ordinary website publication is not approval.

`0002_page_timings.sql` is prepared but unapplied. It was moved here without SQL
changes for the September 30 release, preventing publication from applying it
automatically. Existing `drizzle/0000` and `0001` remain unchanged. See
[the timing rollout](../docs/public-media-and-rum.md) for its separate approval,
owner configuration and verification requirements.
