# Automatic recovery checkpoints

The checkpoint utility preserves recoverable source while Codex or Claude works
in the shared desktop folder. Reviewed source remains GitHub `main`. Installation,
the first checkpoint, and remote upload must be verified independently; see the
dated evidence in [the current handoff](agent-handoff.md). Activation evidence is
pending for this implementation until the owning agent records verification.

## Operation

The Windows task **Portalink Git Checkpoint** runs the installed, reviewed
Node/Git runner every four minutes while the user is logged on and the computer
is awake. Sleep, shutdown, and a logged-out session prevent regular runs. It
uses no AI calls and no Codex scheduled automation.

The private bare Git store is
`%LOCALAPPDATA%\Portalink\Checkpoints\checkpoint.git`. It has its own index and
checkpoint history. The one remote destination is `autosave/thinkpad` in the
existing `avimangalmurti-art/Portalink` GitHub repository. Its history starts
independently from application history; later checkpoints extend that recovery
history without merging application commits.

Each snapshot contains:

- `workspace/`: the included working files, preserving repository-relative paths.
- `manifest.json`: source/checkpoint metadata for interpreting the snapshot.
- A root `README.md` explaining the recovery format and its boundaries.

The runner observes tracked and untracked working files, honoring Git ignores
and its additional deny rules. Environment files, credentials, local settings,
dependencies, caches, and generated outputs are excluded by policy. Content is
scanned before saving; a detected secret blocks the whole new checkpoint rather
than silently producing a partial snapshot. A checkpoint is therefore not a
backup of ignored credentials, production data, unsaved editor buffers, or all
files on the computer. No scanner can prove arbitrary content is secret-free;
keep credentials out of source and review unexpected blocked-file reports.

Checkpointing does not change source files, the working index/staging area,
working-repository refs, or the current branch. It does not commit unfinished
work to the application branch. Its metadata records what was observed; only
[the agent's handoff](agent-handoff.md) records intent and remaining decisions.

Offline checkpoints remain local. Upload is retried on later runs even when
the included workspace has not changed. Divergent or unexpected remote history
stops synchronization for review: the runner never force-pushes or merges it.
It executes no application scripts or Git hooks and performs no application
build, SQL migration, Sites/worker deployment, signing, or release.

## Controls and status

From the repository root in PowerShell, use the management script:

```powershell
./scripts/checkpoints/manage.ps1 -Action Status
./scripts/checkpoints/manage.ps1 -Action Run
./scripts/checkpoints/manage.ps1 -Action Disable
./scripts/checkpoints/manage.ps1 -Action Enable
```

`Status` reports the installation/task and recorded checkpoint result. Check
both local capture and remote synchronization: an enabled task or locally saved
snapshot alone does not prove GitHub has it. `Run` requests a checkpoint from
the enabled task now; use `Status` to inspect its result. `Disable` pauses
scheduled execution; an already running checkpoint may finish. `Enable` resumes
the installed task. Neither is a restore command.

Initial installation uses `-Action Install` with the verified scanner path and
SHA-256. Installation is disabled by default. `-RemoteVerified` records the
operator's completed remote-integration review, and `-Activate` additionally
enables scheduling. These setup options are not required when switching coding
agents; `Enable` requires an installation whose remote integration was verified.

The task uses an installed copy so a source edit cannot silently change the
background program. Review and deliberately install runner updates. Existing
Git authentication is reused without storing credentials in this repository;
authentication failures require attention through the existing secure setup.

For a blocked scan, inspect the reported paths without copying secret values
into chat or logs. Remove credentials from source through an authorized fix,
then rerun. For an offline result, allow a later retry or use `Run` after the
connection returns. For a remote-history conflict, preserve both histories and
review them separately; do not reset or force-push to make the status green.

All current and future application CI and release pipelines must exclude
`autosave/**`, including PR, manual, Sites, worker, EAS, signing, and app-store
paths. Do not open a checkpoint PR into `main` or use checkpoint commits as
build/release inputs.

## Deliberate recovery

Routine agent handoffs need no restoration and no Git operation from the user.
For actual recovery, stop the writer and inspect the selected snapshot in a
**separate recovery folder**. Never check out or merge `autosave/thinkpad` in the
working repository: its root contains recovery metadata and `workspace/`, not
the application tree. There is no automatic restore command.

The following manual example reads the private store and exports an explicitly
selected checkpoint. Replace the sample commit with a full commit ID from the
log. All created files remain in the separate recovery folder.

```powershell
$checkpointStore = Join-Path $env:LOCALAPPDATA 'Portalink\Checkpoints\checkpoint.git'
$recoveryFolder = Join-Path $env:USERPROFILE ('Portalink-Recovery-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $recoveryFolder -ErrorAction Stop
git --git-dir="$checkpointStore" log --all --oneline -20
$checkpointCommit = 'REPLACE_WITH_SELECTED_FULL_COMMIT_ID'
git --git-dir="$checkpointStore" show "${checkpointCommit}:manifest.json"
$recoveryArchive = Join-Path $recoveryFolder 'checkpoint.zip'
git --git-dir="$checkpointStore" archive --format=zip --output="$recoveryArchive" $checkpointCommit workspace manifest.json README.md
if ($LASTEXITCODE -ne 0) { throw 'Checkpoint export failed.' }
Expand-Archive -LiteralPath $recoveryArchive -DestinationPath (Join-Path $recoveryFolder 'candidate')
```

If the private store is unavailable, explicitly fetch only the recovery branch
into a **new bare repository inside that separate recovery folder**. Use the
existing account's normal Git authentication:

```powershell
$checkpointStore = Join-Path $recoveryFolder 'remote-checkpoint.git'
git init --bare "$checkpointStore"
if ($LASTEXITCODE -ne 0) { throw 'Recovery repository creation failed.' }
git --git-dir="$checkpointStore" fetch --no-tags https://github.com/avimangalmurti-art/Portalink.git refs/heads/autosave/thinkpad:refs/heads/checkpoint
if ($LASTEXITCODE -ne 0) { throw 'Checkpoint fetch failed.' }
git --git-dir="$checkpointStore" log refs/heads/checkpoint --oneline -20
```

Then select a commit and use the export steps above. A local snapshot may be
newer than the latest successfully uploaded snapshot.

Inspect `candidate/workspace/`, the manifest, and the saved handoff before
copying anything. Compare the candidate with the current working files and
current reviewed `main`. Review deletions explicitly; absence from a snapshot
can mean an ignored/excluded file rather than a requested deletion. Preserve
the existing ignored `.env.local`, credentials, and local configuration. Apply
only the reviewed recovery changes on a deliberate feature branch, run checks
appropriate to those changes, and follow the normal review flow into `main`.
Never replace the whole working folder or restore database state from this
source checkpoint.
