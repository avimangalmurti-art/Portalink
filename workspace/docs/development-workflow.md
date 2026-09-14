# Shared development workflow

This guide describes the existing Windows checkout and checks as of 2026-09-14.
Follow [AGENTS.md](../AGENTS.md) and the current user request. These instructions
do not authorize publishing, production database changes, or new infrastructure.

## One product, two coding agents

The desktop checkout is `C:/Users/avima/OneDrive/Desktop/Portalink Platform`.
Its GitHub remote is named `github`, pointing to `avimangalmurti-art/Portalink`.
Reviewed source belongs on GitHub `main`; the current local branch may have a
different name. Inspect Git rather than assuming the open folder is on `main`.

Codex reads [AGENTS.md](../AGENTS.md). Claude reads [CLAUDE.md](../CLAUDE.md), which
imports that file. Start either agent from the repository root. In Claude, use
`/context` to confirm the project instruction file is loaded. Keep durable shared
decisions in Git-tracked documentation, not solely in an agent's chat history.
See [Claude's import documentation](https://code.claude.com/docs/en/memory#agentsmd)
and [Codex's instruction documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

1. Read [the current handoff](agent-handoff.md) and inspect `git status --short --branch`,
   `git log -1 --oneline`, and the relevant diff before editing.
2. One independent Codex or Claude session owns writes in this checkout at a time,
   including Git, installation, and preview-server operations. The other may
   review without changing files. The owning session may coordinate subagents
   on explicitly assigned, non-overlapping files and review their combined diff.
   The checkpoint runner may observe files concurrently because its Git writes
   stay in its separate private store; it cannot edit the working checkout.
3. When clean and free of another agent's work, fetch `github` and create a task
   branch from current `github/main`. Use a descriptive name such as
   `codex/<task>` or `claude/<task>`. Placeholder names are not literal commands.
4. Make the scoped change and run the appropriate checks below. Review the diff
   for unrelated edits, credentials, temporary artifacts, and missing files.
5. When saving to GitHub is authorized, commit only the intended files and push
   the task branch. Review through a pull request into `main`; use the other agent
   as a reviewer when useful. Do not bypass existing branch protection.
6. Merge reviewed work once checks pass, then refresh the next task from `main`.
   Resolve divergence through review; do not force-push, discard changes, or
   reset the shared checkout to make synchronization appear successful.

For concurrent editing, use separate Git worktrees and branches of this same
repository. Branches alone do not isolate simultaneous writes in one directory.
Each worktree needs its own ignored local environment and dependencies, a
distinct preview port, and the same existing backend configuration. Confirm any
additional Auth callback URL separately; do not change Auth during setup.
Worktrees do not create a product fork or another Supabase project.

### Switching between Codex and Claude

A routine switch requires no Git commands from the user. Stop the previous
writer, open the next agent in this same folder, and have it read AGENTS.md and
[docs/agent-handoff.md](agent-handoff.md), inspect status and the relevant diff,
then continue the authorized task. The next agent preserves uncommitted work.
Switching agents does not require a commit, pull, branch change, checkpoint
restore, or dependency installation. The branch/review steps above still govern
new work and integration into `main`.

[Automatic checkpoints](checkpoints.md) provide a separate recovery copy every
four minutes while Windows is logged on and awake. They require no AI calls or
Codex automation. The runner records observed files and source metadata; the
owning agent still explains intent, checks, and remaining work in the handoff.
Check the installation's reported status rather than assuming a checkpoint
exists or has uploaded.

If working from Windows, keep using its existing Node dependencies and PowerShell
commands. Do not reuse the same `node_modules` tree from WSL/Linux. Do not move
the OneDrive desktop folder or alter sync settings as part of agent onboarding.

## Handoff format

Update [docs/agent-handoff.md](agent-handoff.md) briefly at meaningful milestones
and before yielding write ownership. Include these in the task/PR as relevant,
with no secrets or real user-content examples:

- Task, MOBILE/WEB/ALL scope, branch, starting and resulting commits.
- Files changed and intended behavior; who owns further edits.
- Checks actually run, results, skipped checks, and device-testing limits.
- Uncommitted work, failures, and next steps.
- Migration files and verified application status, if relevant.
- Sites version/source and worker deployment status, if relevant; say explicitly
  when changes have only been saved locally or pushed to GitHub.

A checkpoint can capture the latest saved note, but does not write or interpret
it. A crash between milestones can leave the note behind the observed files;
the next agent must inspect the diff before acting.

## Local setup and environment

Use the existing `.env.local`; never overwrite it with `.env.example`. Only the
example is tracked. `.gitignore` excludes `.env*` except `.env.example`, `*.local`,
dependencies, and build outputs. Check ignore behavior before creating new
credential files or personal Claude files such as `CLAUDE.local.md`; those names
must not be assumed ignored. Keep credentials and personal settings outside
committed instructions, terminal logs, screenshots, and PRs.

| Variable/binding | Use and scope |
|---|---|
| `VITE_SUPABASE_URL` | Existing Supabase project URL; read by browser client and built Sites worker. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-safe publishable key for that same project; RLS and server checks enforce access. |
| `VITE_RUNTIME_MODE` | `production` fails closed if Supabase is missing; `prototype` is for explicit simulations. |
| `VITE_ENABLE_ACCOUNT_DELETION` | Legacy variable; keep false. Source and endpoint hard-disable deletion regardless. |
| `SUPABASE_URL` | Existing project URL for separately hosted PDF/video workers. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only worker credential in its secret manager; never a `VITE_*` value. |
| Sites `DB` / `ASSETS` | Existing managed D1 database and static assets; bindings, not browser credentials. |
| `PGLITE_MODULE_PATH` | Optional absolute PGlite module path for isolated `scripts/verify-*-database.mjs` checks. |
| `PGLITE_MODULE` | Optional absolute PGlite module path for the video SQL Node test; a different variable name. |
| `FFMPEG_PATH` / `FFPROBE_PATH` | Optional local executable paths for video processing tests/runtime. |

Worker polling/lease/resource options are documented in the
[PDF worker](../workers/pdf_processor/README.md) and
[video worker](../workers/video_processor/README.md). Existing hosting-provider
tokens are not application configuration and must not be copied into handoffs.
Do not add a service-role key to a frontend development environment. Obtain any
missing configuration through the user's existing secure channel, not chat.

Services are selected in [the registry](../src/services/index.ts) using valid
Supabase configuration, not runtime mode alone. `VITE_RUNTIME_MODE=prototype`
with valid Supabase values still connects core services to real data. Normal
local development can therefore mutate live data through account actions; it is
not a sandbox. Use synthetic unit/database tests for verification. The explicit
placeholder override procedure in [dual-view development](dual-view-development.md)
is available for a deliberately simulated preview without rewriting `.env.local`.

## Start and verify locally

Use the existing Node 22 toolchain (22.13+), npm, and `rg`. On a fresh checkout
run `npm.cmd ci` to install the lockfile; do not reinstall while another agent's
server or build is using the same dependency tree. Preserve package scripts,
dependencies, and lockfile unless a separate change requires them.

```powershell
npm.cmd run dev -- --host=127.0.0.1 --port=5173 --strictPort
```

Reuse the running server. `--strictPort` makes a port conflict explicit. Vite's
Sites plugin is part of this app: a generic static preview is not evidence that
`/api/media-interactions` or its D1 binding works. Do not create a replacement
database to compensate for missing local host capabilities. See
[Sites deployment](sites-deployment.md) for build/runtime requirements.

Use AGENTS.md's verification level for the change. Documentation-only work needs
link/path, factual, scope, and whitespace checks; it does not require UI changes
or a production deployment. For application changes that require full checks,
run each command separately and inspect its exit status:

```powershell
npm.cmd run typecheck
npm.cmd run lint
node.exe --test @(rg --files tests -g '*.test.mjs')
npm.cmd run build
```

PowerShell does not automatically stop after a failed native command. Check
`$LASTEXITCODE` before continuing. Select affected test files for focused changes.
There is no `npm test` script or repository browser/visual-regression runner.
Browser previews do not establish real-phone touch, keyboard, or PWA behavior.

### Isolated database checks

The verification scripts use in-memory PostgreSQL via PGlite with synthetic
accounts, not the live Supabase database. If PGlite is unavailable, provision the
test dependency in a separate temporary tools directory as an explicit local
setup step; do not change application dependencies or claim skipped tests pass.
Point both environment variables at the same installed `dist/index.js` entry.

```powershell
# Replace the example path with the absolute path to your local test dependency.
$env:PGLITE_MODULE_PATH = 'C:/path/to/test-tools/node_modules/@electric-sql/pglite/dist/index.js'
$env:PGLITE_MODULE = $env:PGLITE_MODULE_PATH
node.exe scripts/verify-private-content-database.mjs
node.exe --test tests/video-processing-db.test.mjs
```

`tests/video-processing-db.test.mjs` skips without `PGLITE_MODULE`. It verifies
fresh-install and forward-repair worker permissions, leases, original preservation,
output integrity, visibility, and owner retries. Other isolated checks include
`verify-messaging-database.mjs`, `verify-public-appearance-database.mjs`, and
`verify-account-deletion-database.mjs`; read their synthetic setup before use.
None establishes which migrations were applied to production. Do not substitute
`db push`, `db reset`, or `migration repair` for these tests.

### Python worker checks

Use a dedicated local Python environment and the relevant existing requirements
file. For example, when that environment has not already been prepared:

```powershell
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r workers/pdf_processor/requirements.txt
./.venv/Scripts/python.exe -m pip install -r workers/video_processor/requirements.txt
```

Do not recreate or repurpose an existing environment without checking its owner.
Run PDF tests from `workers/pdf_processor` using that environment's interpreter:

```powershell
../../.venv/Scripts/python.exe -m unittest discover -s tests -p 'test_*.py'
```

Run video tests from the repository root:

```powershell
./.venv/Scripts/python.exe -m unittest discover -s workers/video_processor/tests -p 'test_*.py'
```

Video tests require `httpx` plus FFmpeg/ffprobe for conversion coverage. Use their
path variables if they are not on PATH; review skips. Tests create synthetic
media and do not need production credentials. Running the actual worker entry
point with server credentials is different: it can claim production jobs.

## Existing automation and remaining gaps

[Quality CI](../.github/workflows/quality.yml) runs for reviewed development PRs
and pushes to `main`; checkpoint branches must be excluded from both paths.
It runs typecheck, lint, build, and PDF-worker tests. It currently does not run
the Node suite, PGlite database checks, or video-worker tests. The checkpoint
tooling does not add those jobs or claim new application coverage. Adding them
remains a separate, reviewable tooling change.

Keep `autosave/**` excluded from all application workflows and future Sites,
worker, EAS, signing, and app-store release pipelines, including manual and
PR-based triggers. Recovery snapshots are not release inputs. The checkpoint
runner never executes project scripts, Git hooks, builds, migrations, or deploys.

During the preceding source review on 2026-09-14, build/typecheck/lint and isolated
database checks passed; the presentation test failure was corrected and its
focused tests passed. The local video-worker run failed to import missing
`httpx`; that is an environment gap, not a successful conversion test. Historical
test counts elsewhere are evidence for their recorded revision only.
