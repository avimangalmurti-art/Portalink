# One-screen onboarding

Implementation on codex/one-screen-onboarding; publication explicitly authorized on October 15, 2026. See agent-handoff.md for the deployment receipt.

Existing Hello World welcome artwork and playback are retained. Google, Apple, email, sign-in and guest options share entry. Email asks for name, a suggested editable public handle, email and one password with Show/Hide. Photo/location/appearance are not required before signup; saved registration details remain durable across email verification. Verification is never bypassed.

The footer opens the in-app Terms and Conditions sheet: A.Terms of Service, B.Privacy Policy, C.Content Licence, D.AI Access Terms. Each opens in place. Agree resumes pending signup/provider launch; Disagree cancels it and returns to Welcome. Entry underneath is inert. No external legal URLs or new published pages.

**Legal copy pending review:** all agreements and the overview contain clearly labelled placeholders. Acknowledgement is in-memory, not a reviewed/versioned acceptance receipt. Final copy, durable acceptance/version policy and reacceptance on material change need review. No outbound email service was added from the reference design.

After profile setup, appearance and adding a first project are optional. Skip enters the app; Add uses existing authenticated draft/publishing behavior. Existing explicit navigation intents are preserved.

Providers use the existing Supabase client/project. Availability reads public Auth settings and fails closed. Inspection found Google and Apple disabled, email enabled. Configure provider credentials/allowed callback origins in the SAME project before real social testing; no settings were changed here. OAuth redirects are origin-bound and accept only sanitized public/share destinations. Protected profile lookup supplies ownership; provider metadata supplies display defaults only.

Validation:198 focused tests, typecheck, lint(0errors112existingwarnings), client+worker production build and main/visitor configured bundle guards pass. Synthetic actual-component checks cover mobile/desktop validation, verification messaging, agreement reading/cancellation and optional setup. Real OAuth consent, email delivery, production writes and physical-device acceptance are untested. No publication or migration performed.
