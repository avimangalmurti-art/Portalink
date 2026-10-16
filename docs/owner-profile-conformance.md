# Owner profile and reader conformance

Task branch `codex/owner-profile-conformance`, based on reviewed `github/main` at `5c3f7f2`. This is draft source review only; no merge or publication.

The signed-in owner's profile and reader retain the app's device appearance instead of using public branding. That separation already exists in reviewed source and is now explicitly regression-checked. The screenshots set app appearance to dark/blue and the same creator's public appearance to light/green, proving the boundary. Existing device theme choices are preserved.

Both profile renderers begin on Journey, with Portfolio one tap away. A choice lasts for the current visit; an old stored Portfolio preference no longer overrides the initial tab. Public Journey visibility/privacy remains enforced. This initial-tab change is the sole intentional change to normal visitor profile rendering.

Mobile owner profile uses the standard floating, monochrome Actions control rather than an inline duplicate. Owner reader removes only its mobile list/ellipsis/person bar. Open portal, Project information and View profile move into Actions, preserving their original callbacks; the page counter/slider and desktop reader are unchanged. Other action rows remain available, including deletion confirmation.

View as visitor is an owner-only profile Actions row. It loads the existing public entry and public profile bundle, never the owner's full-profile cache. Its top bar says Viewing as a visitor and Done returns to the canonical owner route through the app entry. Normal visitors see no preview bar. Preview persists through internal links for that creator; private profiles still receive the existing public denial. No authoring controls or app dock appear in preview.

## Verification

[Real-app screenshots](evidence/owner-profile-conformance-20261012/README.md) use deterministic page-local services, synthetic projects and account, app dark/blue, public light/green. No production account/content changes. Mobile 420x912 checks cover owner Journey, owner Actions, reader and relocated information, normal public Journey/Portfolio/reader, preview and Done; desktop 1280x900 confirms shared Journey default and unchanged reader presentation. Browser error log is empty after final flows. Physical iPhone touch/Safari verification remains outstanding.

169 focused checks pass, covering Journey selection, owner/public action capabilities, relocated reader actions, public theme/preview/Done and unchanged visitor controls, device appearance and profile composition. Typecheck, lint (0 errors, 111 existing warnings), client/worker build and configured main/visitor Supabase bundle checks pass. Full Node suite:1,642pass,0fail,0skipped. Computed interface colors in owner profile and public reader contain no saturated accent outside the chosen blue/green; standard Actions CSS has no independent saturated color. User artwork and existing destructive status semantics are preserved.

## Release boundary

No SQL, Supabase/Auth changes, worker/D1 changes, merge, Sites publication or deployment. Preserve separate pending tasks/PRs and current live PR42 source during eventual reviewed integration. Do not publish this branch alone over the live site. Mobile dock/reader control changes stay mobile; Journey default and public preview rendering use the shared core on both presentations.
