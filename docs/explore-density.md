# Explore density and restored top controls

Scope: the root feed reached by the dock's Explore link (HomeFeed internally), not the globe or account-search results. Task branch codex/explore-density was created from current github/main5c3f7f2, then fast-forwarded to PR53 f81f034 to retain the source currently published as Sites380. Review is stacked on PR53 so only this task's change appears.

The mobile top row is restored from the previous published design: globe, Home, account search, refresh, and inline three-dot Actions. Existing Actions entries, pull-to-refresh, hover-area centering, safe-area geometry and dock are preserved. The header provides its own top inset; a scoped rule prevents a second safe-area inset. This week is unchanged.

The Home-only 150px/two-column projection is removed. The same gallery gesture and existing density hook used by Profile now accept2–13 columns on the feed. Signed-in changes use the existing owner-only project_grid_columns preference (shared with Profile); guests adjust local state with no profile writes. No SQL or new preference store. City, globe, profile and visitor components are unchanged; desktop keeps its previous presentation and Ctrl/Command-wheel gesture.

Checks:102 focused tests pass,0 skipped, including disposable density RLS checks; typecheck passes; lint0errors/112 existing warnings; client/worker build and configured main+visitor Supabase graph guards pass. No broader suite rerun: the change is bounded to existing feed presentation and its gallery connection.

Actual application components with synthetic page-local services: native TouchEvents produced2→3→4→5 columns and three owner saves; guest2→3 with zero writes; native Ctrl-wheel changed desktop guest density with zero writes; refresh button made one additional feed request; account-search and Actions callbacks worked. Three columns fit375/390/420/430;13 columns fit375. Desktop1280 has no mobile header or horizontal overflow. Final preview error logs empty. No real account/preference/content writes or physical-iPhone proof. Owned preview stopped/tab closed/viewport reset.

Source edits are ready for publication review. No Sites publication, SQL application or GitHub main merge in this task. Billing/PR53 merge remains deferred at the user's request. Existing live release remainsSites380.
