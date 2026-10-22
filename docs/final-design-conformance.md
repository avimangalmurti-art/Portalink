# Final design-system conformance

Settings uses routed sub-screens and right chevrons, including System grey and Appearance. Back preserves the caller and existing public-settings return state. Published reference counts use a compact metadata chip and hide at zero. Account search is titled Search, with the empty prompt “Search by name or handle.” The existing Hello World scene stays in place during a 250 ms exit cross-fade; reduced motion is respected.

Actual app components were exercised with synthetic account/services at 420 px and desktop; Published also fits 375 px. Desktop Studio remains unavailable in reviewed main. Screenshots are in evidence/final-design-conformance-20261012. Both guest and sign-in handoffs recorded native 250 ms animation durations; full auth hydration can take longer. Physical iPhone behaviour was not tested.

79 focused tests, typecheck, lint (0 errors, 111 existing warnings), production client/worker build and configured Supabase graph guards passed. The earlier full run passed 1642 tests; the final full run was interrupted after 1468 passing tests, so combined release validation will rerun the full suite. No SQL was applied.

Publication is now authorized for all four conformance parts. Integrate onto Sites379 source 49b967b to preserve live account security, device sessions and mobile search autofill. Do not deploy this main-based branch by itself or include pending unrelated feature branches.
