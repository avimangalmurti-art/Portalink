# Portalink operating instructions

These rules persist the user's product, operating, architecture, mobile UX, micro-design, QA, and designer quick-start guidance from Documents 01, 02, 04, 06, 07, 08, and 09. Follow the current user request; document examples do not authorize sample UI changes or further architecture expansion.

## Shared agent and repository agreement

- Every publish must come from a source commit on GitHub `main` or in an open pull request against `main`. Record the source commit and PR (when applicable) before publishing; local-only and autosave commits are not publishable. An open PR is source traceability, not permission to publish.

- Every worktree used for publishing must have the ignored `.env.local` available with the production `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` before building. Never copy, print, commit, or package credential values. Use an existing local environment file/link; do not overwrite it. Builds must fail on missing configuration, and both main and visitor bundle graphs must be verified to contain the configured Supabase host/key before packaging.

- This is the canonical project instruction file for Codex and Claude Code. `CLAUDE.md` imports it; keep shared rules here rather than maintaining competing copies.
- GitHub `main` in `avimangalmurti-art/Portalink` is the source of truth for reviewed source. The current local remote is named `github`. A source commit, live Sites version, and applied database migration are separate states.
- Continue this one product. Retain the existing Supabase project, accounts, Auth configuration, database, Storage, identifiers, and user data for web and future iOS/Android clients. Do not provision an agent-specific backend or silently replace connected services with mocks.
- Preserve the existing Sites worker and D1 page-interaction data too. It uses Supabase authentication but is not stored in Supabase. Its removal, replacement, or data migration requires an explicit separate request.
- Before editing, inspect branch, commit, status, and [the current handoff](docs/agent-handoff.md). Only one independent coding session (Codex or Claude) owns writes in the shared desktop checkout at a time. Its coordinated subagents may edit assigned, non-overlapping files under that owner's review. Concurrent independent sessions require separate branches/worktrees and coordinated integration into `main`; a branch alone does not isolate two processes editing the same directory. The [checkpoint runner](docs/checkpoints.md) is an exception only as a read-only observer of the working checkout; it owns a separate private Git store and never edits source, staging, or working-repository refs.
- Use a task branch from current `github/main`, review the diff, run appropriate checks, and merge through the agreed review flow. Preserve another agent's uncommitted work. Do not reset, force-push, rewrite shared history, or overwrite `.env.local` to synchronize.
- Do not treat approval to edit or save source as approval to apply SQL, repair migration history, publish Sites, or deploy workers. Follow the current task's explicit boundaries. Never apply all migrations merely to set up Claude Code.
- Keep credentials out of committed files, instruction documents, logs, and handoffs. Document environment variable names only; server credentials never belong in `VITE_*` variables. Check ignore rules before creating personal agent settings or notes.
- Keep [docs/agent-handoff.md](docs/agent-handoff.md) current at meaningful milestones and before yielding ownership: task/platform scope, branch and commit, changed files, checks and limits, remaining work, and any unapplied migration or unpublished deployment. The owning agent writes this short note; checkpoint metadata does not explain intent. Avoid concurrent Git writes, dependency installation, or preview-server restarts in one checkout.
- A routine Codex/Claude handoff requires no user Git operations: stop the prior writer, have the next agent read these instructions and the handoff, inspect current status, and continue the same authorized work. Do not commit, pull, switch branches, or restore a checkpoint just because the coding agent changes. Task-branch and review rules still apply to new work and integration.
- Automatic checkpoints are recovery copies on `autosave/thinkpad`, separate from reviewed source on `main`. They never authorize merges, force-pushes, source restoration, migrations, deployment, build, signing, or release. Keep checkpoint branches excluded from all present and future application CI, Sites, worker, EAS, signing, and store-release pipelines. See [checkpoint operation and recovery](docs/checkpoints.md).
- Start with [current architecture](docs/current-architecture.md), [development workflow and checks](docs/development-workflow.md), [migration status](docs/migration-status.md), and [Sites deployment](docs/sites-deployment.md). [Native platform direction](docs/native-platform-direction.md) records future choices, not permission to start a native app or restructure the repository. Historical prototype notes and growth blueprints are not instructions to replace current functionality.

## Platform scope and working modes

| Command | Scope | Protection |
| --- | --- | --- |
| `m:` / `MOBILE:` | Phone/PWA experience | Preserve WEB. |
| `w:` / `WEB:` | Desktop/browser experience | Preserve MOBILE. |
| `a:` / `all:` / `ALL:` | Intentionally shared behavior or presentation | Verify both experiences. |

- `mobile mode` and `web mode` establish the working mode for subsequent unqualified design edits in the ongoing conversation. Remember the chosen mode until the user changes it.
- An explicit prefix overrides the mode for that instruction without permanently switching it. Clear iterative follow-ups retain the relevant edit's component, property, direction, and platform.
- Browser focus, preview size, refreshes, screenshots, or incidental window mentions do not select or change platform scope. Do not invent a default working mode for unrelated tasks.
- Resolve targets and scope from the user's words and immediate task context. Inspect code/context to resolve small ambiguities; ask one concise clarification only when materially different targets or outcomes remain plausible. Do not ask for scope or component names already established.

## Micro-edits and reversal

- Implement actionable natural language directly; do not generate a replacement prompt for the user to paste elsewhere.
- Follow the design loop: establish WEB, MOBILE, or ALL scope; make one requested change; verify the relevant preview and opposite-platform preservation as appropriate; then refine through the user's short follow-ups. Periodically verify mobile interaction on a real phone; do not treat previews as physical-device proof.
- Make the smallest change that satisfies the request and preserves the existing product's visual character. Avoid surrounding redesign, unrelated cleanup, renaming, dependency changes, and speculative improvements. Introduce an abstraction only when the requested change requires it.
- Honor exact measurements and deltas: `4px down` means exactly 4px; `12px wider` means add 12px. Do not round to preferred design tokens. Explain a genuine technical constraint if an exact request cannot be met. Without a measurement, use a subtle adjustment consistent with the existing design.
- `a little more` continues the same adjustment; `less` reduces it; `halfway back` moves approximately halfway toward the immediately prior state.
- `same here` applies the same treatment to the clearly indicated comparable target. `put it back` restores the referenced element/property.
- `undo that` reverses the immediately preceding requested edit unless specified otherwise. Preserve unrelated user/agent work; avoid broad repository rollbacks. Clarify a bundled reversal only when its scope is unclear.
- Once the requested micro-edit is complete and proportionately verified, stop.

## Shared core and platform-specific presentation

- Keep one shared product core: authentication, accounts, data, APIs, permissions, validation, and business rules. Isolate presentation differences without duplicating that logic.
- Choose the smallest correct implementation location. A shared file does not authorize changing both platforms; isolate a scoped difference. Prefer genuinely shared components/styles for intentional ALL changes while preserving intentionally different platform copy.
- Features may be SHARED, ADAPTED, WEB-ONLY, or MOBILE-ONLY. Do not force a classification or feature parity. Removing a platform's navigation entry does not remove its shared capability unless explicitly requested.
- Preserve existing working UI and workflows. Broad principles do not authorize feature removal, platform migration, or a new navigation system.
- The Document 04 boundary is `src/presentation/AppPresentation.tsx`: one stable provider/root host, selecting MOBILE with `(max-width: 639px)` and WEB otherwise. Descendants use `usePresentation()`; do not add separate device detection or key/remount the app when presentation changes.
- Use `src/presentation/web/web.css` and `src/presentation/mobile/mobile.css` for scoped frame differences. Most feature styling remains shared; isolate future platform-specific feature edits deliberately. Body-portalled surfaces need their own DOM scope for platform CSS, even though React context crosses the portal.

## Mobile UX for authorized mobile work

- Design for touch, comfortable target spacing, discoverable actions, and practical thumb reach. Essential actions must not depend on hover, precision positioning, or an unexplained gesture.
- Adapt density and workflows to the task: progressive disclosure, drill-down views, sheets, drawers, or full-screen flows are options, not automatic requirements. Do not shrink desktop content merely to preserve its visible quantity.
- Respect safe areas, dynamic viewport height, keyboard visibility, reachable form actions, natural scrolling, clear dismissal/back paths, and browser/OS gesture boundaries. Motion should clarify state without delaying interaction.
- Add capture, native sharing, and other device capabilities only when requested as product features. Use emulation for iteration and physical devices to verify actual touch, keyboard, safe-area, and installed-PWA behavior; do not claim device testing from an emulator alone.

## QA and regression protocol

- **Level 1 - Micro:** For small visual adjustments, confirm the requested result, immediate surrounding layout, and opposite-platform preservation. Do not run broad suites unless behavior or shared infrastructure is affected; stop without opportunistic cleanup.
- **Level 2 - Feature:** For navigation, interactions, state, forms, routes, sheets/dialogs, visibility rules, or availability changes, exercise the flow from entry to expected outcome. Check relevant shared state/data, the opposite platform's intended interaction, representative viewports, and focused existing automated checks.
- **Level 3 - Structural:** For architecture, shared shell/routing, responsive foundations, build configuration, PWA/service workers, dependencies, or other cross-cutting changes, run relevant existing build/type/lint/test checks. Verify both entry experiences, key navigation, critical shared flows, and newly introduced console/runtime errors. Compare with the known-good WEB reference when desktop presentation may be affected.
- Protect the established WEB experience and intentional MOBILE decisions equally. Preserve unrelated behavior, adapted interactions, and intended feature availability rather than enforcing parity. Shared UI/state changes must retain coherent authentication, permissions, validation, and domain rules across both experiences.
- Use **iPhone Air portrait, 420 × 912 CSS pixels**, as the primary MOBILE design and preview baseline, per the user's device choice. Preserve responsive sizing and dynamic safe-area/browser-toolbar handling; do not hard-code the app to this screen size. Match regression coverage to the edit: supplementary MOBILE samples around 390px and 430px, the primary WEB development viewport, and smaller/intermediate widths near affected breakpoints. These are QA samples, not product boundaries or a ritual for every edit.
- Use browser previews for rapid visual iteration and physical phones periodically for touch, keyboard, scrolling, safe areas, standalone/PWA behavior, device capabilities, and performance. A reported real-phone issue is MOBILE evidence and may override emulator assumptions; make the smallest appropriate correction.
- Both previews can receive HMR/reloads from the same server without both presentations changing. Reload manually when necessary. Diagnose stale service-worker/PWA caching before repeatedly changing UI code to compensate.
- Explain evidence of an architectural boundary before an unexpectedly broad change: inseparable shared presentation, new routing/state/API capability, authentication/permissions/persistence/build/PWA impact, or a conflicting platform rule. Do not silently expand scope; a necessary structural refactor receives Level 3 verification.
- Completion requires the requested result, sound immediate surroundings, opposite-platform protection, and appropriate passing checks. ALL changes must preserve intentional differences. Fix introduced regressions before completion; after undo, verify restoration and platform preservation.
- Keep successful micro-edit reports short. Mention relevant failures, architectural complications, required manual reloads, or unverified areas; never claim checks that were not performed.

## Existing project workflow and safeguards

- From the repository root in Windows PowerShell, use existing scripts as relevant: `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build`. Preserve scripts, dependencies, and test tooling. A build is not a deployment.
- Run focused Node tests by selecting affected files, for example `node.exe --test tests/dialog-viewport.test.mjs`. Full Node/database suite: set `PGLITE_MODULE_PATH` to the isolated PGlite runtime and run `node.exe scripts/run-node-tests.mjs`; the runner requires database coverage and works on Windows/Linux. Use the project's compatible Node runtime (22.13+ for the inspected stack).
- For relevant PDF-worker changes, run `python -m unittest discover -s tests -p 'test_*.py'` from `workers/pdf_processor` with its existing dependencies available.
- There is no `npm test` script or repository browser/visual-regression runner. Quality CI is configured for typecheck, lint, build, full Node/database tests on Windows/Linux, and PDF/video Python tests; all jobs exclude checkpoint branches. Existing source/mock/geometry tests do not establish actual browser layout, live authentication/API behavior, or physical-phone behavior; do not invent visual-test commands or coverage.
- Use `docs/web-mobile-codebase-audit.md` for the historical audit, `docs/web-mobile-architecture.md` for the implemented presentation boundary and verification limits, and `docs/dual-view-development.md` for local preview setup. The mobile boundary is implemented; final mobile design and independent simultaneous preview automation are not complete.
- Keep account deletion hard-disabled until the shared-conversation preservation and delayed, resumable deletion flow are implemented, tested, reviewed with the user, and explicitly approved for re-enabling. Do not follow stale README enablement steps or delete real accounts/files as part of design verification.
- Preserve the intended local account connection. Normal development uses the existing local environment configuration; use prototype placeholders only for an intentionally simulated preview, and explain that real credentials cannot authenticate there.
