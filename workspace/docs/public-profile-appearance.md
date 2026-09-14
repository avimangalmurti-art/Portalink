# Public website appearance

Public profile, Portal and project routes now use the creator's saved accent and system gray, with the same shell frame, dividers, row styling and control geometry as the platform. The light/dark variants of each gray continue to come from the existing tokens.

`profiles.public_appearance` stores `{ accentColor, systemGray, mode }`. Existing owner-only update and profile visibility rules apply. A constraint accepts only a hex color, existing gray identifiers and light/dark/auto modes. No account deletion changes are included.

On the creator's first signed-in platform visit, a legacy profile without saved appearance adopts their current browser settings. Existing saved branding restores before subsequent changes are saved. Saves are serialized and the profile cache updates without reloading the page. Copy public link waits for pending branding to save and reports failures.

Visitors start with the creator's mode (or their system mode when the creator chose Automatic). A visitor toggle saves only `portalink.publicTheme.<profileId>` locally, independently of their own account preferences. High contrast and reduced translucency remain visitor preferences. Public routes keep their existing read-only navigation and content permissions; opening a second creator's public link no longer returns to the previous creator.

Validation: `tests/public-appearance.test.mjs` covers palette validation, visitor isolation, serialized saves, save failures, slow loading, account switching, reverting an in-flight change and public routing. `scripts/verify-public-appearance-database.mjs` runs the full migration history in isolated PostgreSQL with synthetic profiles to check owner writes, guest reads, private visibility and malformed values. Existing appearance and responsive panel tests also pass.
