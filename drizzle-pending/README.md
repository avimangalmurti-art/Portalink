# Reviewed Sites/D1 migration candidates

Sites packages the entire `drizzle/` directory and applies its migrations during
deployment. Keep approval-only candidates here until the user explicitly
approves their database changes. Ordinary website publication is not approval.

On September 30 the user explicitly approved backend activation. Exact copies
of `0002_page_timings.sql` and `0003_project_read_signals.sql` are now staged in
active `drizzle/` for ordered Sites application. These files remain as the
reviewed reference copies; their original PREPARED comments are historical.
Staging is not proof of live application: see the current agent handoff for
deployment receipts. Existing `drizzle/0000` and `0001` remain unchanged. See
[the timing rollout](../docs/public-media-and-rum.md) for its separate approval,
owner configuration and verification requirements.
