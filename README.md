# Portalink

Portalink is the existing creator portfolio and discovery application. Codex and
Claude Code develop this same repository; reviewed source is maintained on
[GitHub main](https://github.com/avimangalmurti-art/Portalink/tree/main).

The live web application is hosted at
[Portalink Networks Inc.](https://portalinknetworksinc.avimangalmurti566055.chatgpt.site/).
The phone experience is currently part of the responsive web/PWA application.
Future iOS and Android clients must retain the existing Portalink accounts and
Supabase data. No separate application backend is required for a coding agent.

## Start here

- [AGENTS.md](AGENTS.md): canonical shared operating and product rules.
- [Current architecture](docs/current-architecture.md): implemented components,
  backend dependencies, and future native-client boundaries.
- [Development workflow](docs/development-workflow.md): Windows setup, Git
  coordination, environment names, and existing checks.
- [Migration status](docs/migration-status.md): evidence and unknowns; not an
  instruction to apply the queue.
- [Sites deployment](docs/sites-deployment.md): how reviewed GitHub changes reach
  the existing site, separately from database and worker changes.

Claude loads the shared instructions through the root [CLAUDE.md](CLAUDE.md).
Both agents must preserve existing functionality and user data.

## Existing backend

Supabase provides accounts/Auth, profiles, projects, media Storage, messaging,
social features, and database authorization. Preserve the existing project and
configuration. Do not create a new Supabase project during development setup.

Individual-page likes, saves, reposts, and comments also use the existing Sites
worker and D1 database. The worker verifies Supabase sessions; this is not a
second account system. A static-only deployment would omit that API. PDF and
video processing are separate worker processes, not part of the frontend build.

## Windows local development

Open the existing desktop project in PowerShell. Use the existing `.env.local`;
do not copy the template over it. If preparing a fresh checkout, obtain its
configuration through the user's existing secure setup, outside Git.

Use Node 22.13+ within the existing Node 22 toolchain, npm, and `rg`. Check the
[development guide](docs/development-workflow.md) before installing dependencies
or starting another server. On a fresh checkout, `npm.cmd ci` installs the locked
dependencies without intentionally updating the lockfile.

```powershell
npm.cmd run dev -- --host=127.0.0.1 --port=5173 --strictPort
```

Connected local development uses real Supabase services. Writes can affect real
data. An explicitly simulated preview requires placeholder Supabase values as
well as prototype mode; it cannot authenticate real users. See
[dual-view development](docs/dual-view-development.md) for the existing preview
workflow.

## Checks and releases

For changes that require full application verification:

```powershell
npm.cmd run typecheck
npm.cmd run lint
node.exe --test @(rg --files tests -g '*.test.mjs')
npm.cmd run build
```

Check each command's result before continuing. The Node suite's video database
test needs `PGLITE_MODULE` or it is skipped. Python worker tests require their
separate dependencies. Setup and verification limits are documented in the
[development guide](docs/development-workflow.md).

GitHub currently runs typecheck, lint, build, and PDF-worker tests. It does not
publish Sites, apply Supabase migrations, or deploy workers, and it does not yet
run the Node suite or video-worker tests. A successful build is not a deployment.

## Account deletion remains disabled

Account deletion is hard-disabled in both the frontend and endpoint. The legacy
environment flag cannot enable it. The proposed replacement SQL remains outside
the migration queue and must not be applied as setup. Follow the separate review
and release gate in [account-deletion safety](docs/account-deletion-safety.md).
