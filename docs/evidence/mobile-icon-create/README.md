# Mobile icon creation verification

Only mobile New portal and the profile-link icon picker opt into the new black screen, accent preview, outlined four-column catalog, separate search control and fixed actions footer. Desktop modal sizing, catalog and autofocus remain unchanged. Uses the existing user accent; no stored data or API changes.

Browser evidence uses real components with synthetic callbacks at 420 × 912, with supplementary 390 × 844 and 430 × 932 checks and desktop 1280 × 900. Portal title survives icon search and selection; Create returns the chosen title/icon. Link brand search and Done persist the chosen icon; Cancel discards the draft while retaining name and URL. Footer hit testing confirms buttons are not covered by icon rows. Safe-area screenshots simulate top 59/bottom 34 CSS pixels; they are not physical iPhone proof. No real account writes were made.

27 focused Node checks pass, including brand/outline differentiation and the existing catalog, title/search/save-lock tests. Typecheck and client/worker build pass, including both Supabase configuration bundle guards. Lint has 0 errors and 114 pre-existing warnings. Screenshots show the two mobile screens and unchanged desktop modals. The ignored QA fixture is not shipped.

Release based on exact live Sites387 source f44b388, excluding unpublished Library layout PR64 and other pending features. GitHub review is stacked on the interface-restoration branch; GitHub main is not merged and billing is not changed. No SQL, runtime configuration, backend or D1 changes.
