# Combined conformance release

Publication scope is the four approved design-system tasks (PRs49–52), integrated onto exact Sites379 source49b967b. Existing security, individual device sessions, mobile search autofill and shared welcome entry are retained. Pending Terms, Studio export/reference features, Journey Insights, onboarding and record tasks are not included. No SQL or runtime environment changes.

Integration conflicts resolved by retaining live mobile centering CSS and Home editor management, adding conformance Home gutters, merging Home's profile action with owner/reader actions, retaining visitor error navigation and preview suffix, preserving the Account security URL and Back state, and retaining mobile textarea search with the new title/empty prompt. The Home test fixture supplies creator records for the retained owner-management capability.

Combined checks: typecheck; lint 0 errors/112 existing warnings; production client/worker build with configured Supabase main/visitor graph guards; 109 focused integration tests. Full regression is running with disposable database/Git fixtures. An initial sandbox attempt was stopped after fixture Git writes were denied; no production database writes were made.

Real combined components were exercised with synthetic account/service data. Home's moved actions and width420 fit; owner dark Journey/default; visitor public appearance/Done; owner reader counter/slider and moved actions; Settings Account/security/Back; Search textarea/autocomplete off/title; Published count2 and hidden zeros all verified. No runtime error logs in final preview. Evidence is under evidence/combined-conformance-20261012; earlier task galleries cover each changed screen and required widths. Physical iPhone verification is not claimed. Desktop Studio remains unavailable as before.

Source, GitHub review/merge, saved Sites version and deployment are separate states. Do not merge through blocked CI or apply migrations as part of this publication.
