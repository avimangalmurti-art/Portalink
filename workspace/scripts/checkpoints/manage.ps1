#requires -Version 5.1
<#
.SYNOPSIS
Installs and controls the current user's Portalink checkpoint task.
.EXAMPLE
.\scripts\checkpoints\manage.ps1 Install -ScannerPath C:\verified\gitleaks.exe -ScannerSha256 <SHA256>
.EXAMPLE
.\scripts\checkpoints\manage.ps1 Install -ScannerPath C:\verified\gitleaks.exe -ScannerSha256 <SHA256> -RemoteVerified -Activate
.NOTES
Installation is disabled by default. -RemoteVerified records the operator's completed
review of the remote checkpoint integration; -Activate additionally enables scheduling.
Use Run to request a checkpoint through the task's serialized launcher.
No repository branch is checked out, committed, reset, or changed by this script.
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('Install', 'Status', 'Run', 'Enable', 'Disable')]
    [string] $Action = 'Status',
    [string] $SourceRoot,
    [string] $StoreRoot = (Join-Path $env:LOCALAPPDATA 'Portalink\Checkpoints'),
    [string] $ScannerPath,
    [ValidatePattern('^[a-fA-F0-9]{64}$')]
    [string] $ScannerSha256,
    [switch] $RemoteVerified,
    [switch] $Activate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# A packaged host can inherit PowerShell Core's module path into Windows
# PowerShell. Prefer this process's own system modules without changing Windows.
$env:PSModulePath = (Join-Path $PSHOME 'Modules') + ';' + $env:PSModulePath
Import-Module Microsoft.PowerShell.Utility -ErrorAction Stop
$taskName = 'Portalink Git Checkpoint'
$remoteUrl = 'https://github.com/avimangalmurti-art/Portalink.git'
$branch = 'autosave/thinkpad'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$userSid = $identity.User.Value
$utf8 = New-Object Text.UTF8Encoding($false)
if ([string]::IsNullOrWhiteSpace($SourceRoot)) { $SourceRoot = Join-Path $PSScriptRoot '..\..' }

function Get-AbsolutePath([string] $Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { throw 'A required path is empty.' }
    $result = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if ($result -notmatch '^[A-Za-z]:\\' -or $result.Substring(2).Contains(':')) {
        throw 'Checkpoint paths must be ordinary absolute paths on a local drive.'
    }
    return $result
}

function Test-Within([string] $Path, [string] $Parent) {
    return $Path.StartsWith($Parent.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Assert-NoRedirect([string] $Path, [switch] $AllowCloudPlaceholder) {
    $cursor = $Path
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            $linkType = $item.PSObject.Properties['LinkType']
            $target = $item.PSObject.Properties['Target']
            $isReparsePoint = [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
            if ($isReparsePoint -and (($linkType -and $linkType.Value) -or ($target -and ($target.Value -join '')))) {
                throw "Symbolic links and junctions are not allowed in this path: $cursor"
            }
            if (-not $AllowCloudPlaceholder -and $isReparsePoint) {
                throw "Reparse points are not allowed in the local checkpoint installation: $cursor"
            }
        }
        $parent = [IO.Path]::GetDirectoryName($cursor)
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
}

function Assert-File([string] $Path, [switch] $AllowCloudPlaceholder) {
    Assert-NoRedirect $Path -AllowCloudPlaceholder:$AllowCloudPlaceholder
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Required file is missing: $Path" }
}

function Find-TrustedExecutable([string[]] $RelativePaths) {
    $programRoots = @([Environment]::GetFolderPath('ProgramFiles'), ${env:ProgramFiles(x86)}) |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique
    foreach ($programRoot in $programRoots) {
        foreach ($relative in $RelativePaths) {
            $candidate = Get-AbsolutePath (Join-Path $programRoot $relative)
            if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                Assert-NoRedirect $candidate
                return $candidate
            }
        }
    }
    throw "Required system installation was not found under Program Files: $($RelativePaths -join ', ')"
}

function Set-PrivateAcl([string] $Path, [switch] $Directory) {
    Assert-NoRedirect $Path
    # Preserve owner/SACL; change only the discretionary access rules. Reapplying
    # a fresh security descriptor can require SeSecurityPrivilege on Windows.
    $acl = Get-Acl -LiteralPath $Path
    $inheritance = [Security.AccessControl.InheritanceFlags]::None
    if ($Directory) { $inheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit' }
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($existingRule in @($acl.Access)) { $null = $acl.RemoveAccessRuleSpecific($existingRule) }
    foreach ($sidText in @($userSid, 'S-1-5-18')) {
        $sid = New-Object Security.Principal.SecurityIdentifier($sidText)
        $rule = New-Object Security.AccessControl.FileSystemAccessRule(
            $sid, [Security.AccessControl.FileSystemRights]::FullControl, $inheritance,
            [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
        $acl.AddAccessRule($rule)
    }
    if ($PSVersionTable.PSVersion.Major -le 5) {
        if ($Directory) { [IO.Directory]::SetAccessControl($Path, $acl) }
        else { [IO.File]::SetAccessControl($Path, $acl) }
    } else {
        [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $Path), $acl)
    }
}

function Write-Json([string] $Path, $Value) {
    Assert-NoRedirect $Path
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 8) + [Environment]::NewLine, $utf8)
    Set-PrivateAcl $Path
}

function Read-Config {
    Assert-File $configPath
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if ($config.schemaVersion -ne 1 -or
        (Get-AbsolutePath $config.storeRoot) -ne $StoreRoot -or
        (Get-AbsolutePath $config.sourceRoot) -ne $SourceRoot -or
        $config.remoteUrl -cne $remoteUrl -or $config.branch -cne $branch) {
        throw 'The installed configuration does not match this Portalink source and checkpoint store.'
    }
    return $config
}

function Get-OwnedTask {
    # Do not treat access-denied or scheduler failures as an absent task.
    $task = Get-ScheduledTask -TaskPath '\' -ErrorAction Stop | Where-Object { $_.TaskName -ceq $taskName }
    if ($task) {
        $principalId = $task.Principal.UserId
        if ($principalId -notmatch '^S-1-') {
            $principalAccount = New-Object Security.Principal.NTAccount($principalId)
            $principalId = $principalAccount.Translate([Security.Principal.SecurityIdentifier]).Value
        }
        if ($task.Description -cne $taskDescription -or $principalId -ne $userSid) {
            throw 'An unrelated scheduled task uses the checkpoint task name; it was left unchanged.'
        }
    }
    return $task
}

function Assert-InstalledIntegrity {
    $config = Read-Config
    Assert-File $integrityPath
    $manifest = Get-Content -LiteralPath $integrityPath -Raw | ConvertFrom-Json
    if ($manifest.schemaVersion -ne 1) { throw 'Unsupported checkpoint integrity manifest.' }
    foreach ($name in @('runner.mjs', 'policy.json', 'gitleaks.exe')) {
        $file = Join-Path $binPath $name
        Assert-File $file
        $property = $manifest.files.PSObject.Properties[$name]
        if (-not $property -or $property.Value -notmatch '^[a-fA-F0-9]{64}$' -or
            (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $property.Value) {
            throw "Checkpoint integrity check failed for $name. Reinstall reviewed files before running."
        }
    }
    return $config
}

function Get-StatusValue($Status, [string] $Name) {
    if ($null -eq $Status) { return $null }
    $property = $Status.PSObject.Properties[$Name]
    if ($property) { return $property.Value }
    return $null
}

$SourceRoot = Get-AbsolutePath $SourceRoot
$StoreRoot = Get-AbsolutePath $StoreRoot
$expectedStore = Get-AbsolutePath (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Portalink\Checkpoints')
if ($StoreRoot -ne $expectedStore -or
    (Test-Within $StoreRoot $SourceRoot) -or (Test-Within $SourceRoot $StoreRoot) -or $StoreRoot -eq $SourceRoot) {
    throw 'The checkpoint store must be exactly the current user LocalAppData\Portalink\Checkpoints, separate from the source.'
}
Assert-NoRedirect $StoreRoot
Assert-NoRedirect $SourceRoot -AllowCloudPlaceholder
$binPath = Join-Path $StoreRoot 'bin'
$configPath = Join-Path $StoreRoot 'config.json'
$integrityPath = Join-Path $StoreRoot 'integrity.json'
$statusPath = Join-Path $StoreRoot 'status.json'
$taskDescription = "Portalink reviewed checkpoint runner; store: $StoreRoot"

if ($Action -ne 'Install' -and ($Activate -or $RemoteVerified -or $ScannerPath -or $ScannerSha256)) {
    throw 'ScannerPath, ScannerSha256, RemoteVerified, and Activate are installation-only options.'
}
Import-Module ScheduledTasks -ErrorAction Stop

switch ($Action) {
    'Install' {
        if (-not $ScannerPath -or -not $ScannerSha256) {
            throw 'Install requires ScannerPath and the independently verified ScannerSha256.'
        }
        if ($Activate -and -not $RemoteVerified) {
            throw 'Activate requires RemoteVerified after the remote checkpoint integration has been reviewed.'
        }
        $ScannerPath = Get-AbsolutePath $ScannerPath
        Assert-File $ScannerPath
        if ((Get-FileHash -LiteralPath $ScannerPath -Algorithm SHA256).Hash -ine $ScannerSha256) {
            throw 'The supplied scanner does not match the verified SHA256.'
        }
        $runnerSource = Join-Path $PSScriptRoot 'runner.mjs'
        $policySource = Join-Path $PSScriptRoot 'policy.json'
        Assert-File $runnerSource -AllowCloudPlaceholder
        Assert-File $policySource -AllowCloudPlaceholder
        $policy = Get-Content -LiteralPath $policySource -Raw | ConvertFrom-Json
        if ($policy.schemaVersion -ne 1 -or $policy.scannerSha256 -notmatch '^[a-fA-F0-9]{64}$' -or
            $policy.scannerSha256 -ine $ScannerSha256) {
            throw 'The verified scanner SHA256 does not match the reviewed checkpoint policy.'
        }
        Assert-NoRedirect (Join-Path $SourceRoot '.git') -AllowCloudPlaceholder
        $nodePath = Find-TrustedExecutable @('nodejs\node.exe')
        $gitPath = Find-TrustedExecutable @('Git\cmd\git.exe', 'Git\bin\git.exe')
        $helperPath = Find-TrustedExecutable @('Git\mingw64\bin\git-credential-manager.exe', 'Git\mingw32\bin\git-credential-manager.exe')
        $powerShellPath = Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell\v1.0\powershell.exe'
        Assert-File $powerShellPath
        $safeDirectory = 'safe.directory=' + $SourceRoot.Replace('\', '/')
        $gitTop = & $gitPath --no-optional-locks -c $safeDirectory -C $SourceRoot rev-parse --show-toplevel 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $gitTop -or (Get-AbsolutePath $gitTop) -ne $SourceRoot) {
            throw 'SourceRoot must be the root of the existing Portalink Git checkout.'
        }
        $sourceRemote = & $gitPath --no-optional-locks -c $safeDirectory -C $SourceRoot remote get-url github 2>$null
        if ($LASTEXITCODE -ne 0 -or $sourceRemote -cne $remoteUrl) {
            throw 'The source github remote does not match the approved Portalink repository.'
        }
        $task = Get-OwnedTask
        # A packaged desktop host may bootstrap the first install through this
        # same owned task to reach the real Windows LocalAppData namespace.
        # An actual installed runner always has config.json and remains protected.
        $initialBootstrap = $task -and $task.State -eq 'Running' -and -not (Test-Path -LiteralPath $configPath)
        if ($task -and $task.State -eq 'Running' -and -not $initialBootstrap) { throw 'The checkpoint task is running. Let it finish before reinstalling.' }
        if (Test-Path -LiteralPath $StoreRoot) {
            if (-not (Test-Path -LiteralPath $StoreRoot -PathType Container)) { throw 'StoreRoot is not a directory.' }
            if (Test-Path -LiteralPath $configPath) {
                $null = Read-Config
            } elseif (@(Get-ChildItem -LiteralPath $StoreRoot -Force).Count -gt 0) {
                throw 'Refusing to install into a nonempty folder without a matching checkpoint configuration.'
            }
        }
        # Disable an owned old schedule before replacing its executable inputs.
        if ($task) {
            $null = Disable-ScheduledTask -TaskName $taskName -TaskPath '\'
            if ((Get-OwnedTask).State -eq 'Running' -and -not $initialBootstrap) {
                throw 'A checkpoint started while disabling the schedule. Let it finish before reinstalling.'
            }
        }
        $runLock = Join-Path $StoreRoot 'run.lock'
        Assert-NoRedirect $runLock
        if (Test-Path -LiteralPath $runLock) {
            throw 'A checkpoint run.lock remains. Inspect the running task or stale lock before reinstalling; no lock was removed.'
        }
        $null = [IO.Directory]::CreateDirectory($StoreRoot)
        Set-PrivateAcl $StoreRoot -Directory
        Assert-NoRedirect $binPath
        $null = [IO.Directory]::CreateDirectory($binPath)
        Set-PrivateAcl $binPath -Directory
        foreach ($pair in @(
            @($runnerSource, (Join-Path $binPath 'runner.mjs')),
            @($policySource, (Join-Path $binPath 'policy.json')),
            @($ScannerPath, (Join-Path $binPath 'gitleaks.exe'))
        )) {
            Assert-NoRedirect $pair[1]
            if ((Get-AbsolutePath $pair[0]) -ne (Get-AbsolutePath $pair[1])) {
                Copy-Item -LiteralPath $pair[0] -Destination $pair[1] -Force
            }
            Set-PrivateAcl $pair[1]
        }
        if ((Get-FileHash -LiteralPath (Join-Path $binPath 'gitleaks.exe') -Algorithm SHA256).Hash -ine $ScannerSha256) {
            throw 'The installed scanner failed checksum verification. The task remains disabled.'
        }
        $hashes = [ordered]@{}
        foreach ($name in @('runner.mjs', 'policy.json', 'gitleaks.exe')) {
            $hashes[$name] = (Get-FileHash -LiteralPath (Join-Path $binPath $name) -Algorithm SHA256).Hash.ToLowerInvariant()
        }
        Write-Json $integrityPath ([ordered]@{ schemaVersion = 1; files = $hashes })
        $config = [ordered]@{
            schemaVersion = 1
            sourceRoot = $SourceRoot
            storeRoot = $StoreRoot
            gitPath = $gitPath
            nodePath = $nodePath
            scannerPath = (Join-Path $binPath 'gitleaks.exe')
            credentialHelperPath = $helperPath
            policyPath = (Join-Path $binPath 'policy.json')
            integrityPath = $integrityPath
            remoteUrl = $remoteUrl
            branch = $branch
            remoteEnabled = [bool]$RemoteVerified
        }
        Write-Json $configPath $config
        $null = Assert-InstalledIntegrity
        # Fixed absolute paths and an encoded command avoid shell/PATH interpolation.
        $runnerPath = Join-Path $binPath 'runner.mjs'
        $nodeArguments = '"' + $runnerPath + '" --config "' + $configPath + '"'
        $mutexName = 'Local\PortalinkGitCheckpoint-' + $userSid
        $launcher = @'
$ErrorActionPreference = 'Stop'
$env:PSModulePath = (Join-Path $PSHOME 'Modules') + ';' + $env:PSModulePath
Import-Module Microsoft.PowerShell.Utility -ErrorAction Stop
$mutex = New-Object Threading.Mutex($false, '__CHECKPOINT_MUTEX__')
$held = $false
try {
    try { $held = $mutex.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $held = $true }
    if (-not $held) { exit 0 }
    [Environment]::SetEnvironmentVariable('NODE_OPTIONS', $null, 'Process')
    [Environment]::SetEnvironmentVariable('NODE_EXTRA_CA_CERTS', $null, 'Process')
    $env:PORTALINK_CHECKPOINT_SERIALIZED = '1'
    $p = Start-Process -FilePath '__CHECKPOINT_NODE__' -ArgumentList '__CHECKPOINT_ARGUMENTS__' -WorkingDirectory $env:SystemRoot -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput '__CHECKPOINT_STORE__\last-run.log' -RedirectStandardError '__CHECKPOINT_STORE__\last-error.log'
    exit $p.ExitCode
} catch {
    $_.Exception.Message | Set-Content -LiteralPath '__CHECKPOINT_STORE__\launcher-error.log'
    exit 1
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
'@
        $launcher = $launcher.Replace('__CHECKPOINT_MUTEX__', $mutexName.Replace("'", "''")).
            Replace('__CHECKPOINT_NODE__', $nodePath.Replace("'", "''")).
            Replace('__CHECKPOINT_ARGUMENTS__', $nodeArguments.Replace("'", "''")).
            Replace('__CHECKPOINT_STORE__', $StoreRoot.Replace("'", "''"))
        $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($launcher))
        $taskAction = New-ScheduledTaskAction -Execute $powerShellPath -WorkingDirectory $env:SystemRoot -Argument (
            '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ' + $encoded)
        $triggers = @(
            (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(4) -RepetitionInterval (New-TimeSpan -Minutes 4)),
            (New-ScheduledTaskTrigger -AtLogOn -User $identity.Name)
        )
        $settings = New-ScheduledTaskSettingsSet -Disable -Hidden -StartWhenAvailable -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Seconds 180)
        $principal = New-ScheduledTaskPrincipal -UserId $userSid -LogonType Interactive -RunLevel Limited
        $definition = New-ScheduledTask -Action $taskAction -Trigger $triggers -Settings $settings `
            -Principal $principal -Description $taskDescription
        $null = Register-ScheduledTask -TaskName $taskName -TaskPath '\' -InputObject $definition -Force
        if ($Activate) { $null = Enable-ScheduledTask -TaskName $taskName -TaskPath '\' }
        [pscustomobject]@{
            Task = $taskName
            State = $(if ($Activate) { 'Enabled' } else { 'Disabled' })
            Store = $StoreRoot
            RemoteEnabled = [bool]$RemoteVerified
            SourceBranchChanged = $false
        }
    }
    'Status' {
        $task = Get-OwnedTask
        $status = $null
        if (Test-Path -LiteralPath $statusPath) {
            Assert-File $statusPath
            $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
        }
        $info = $null
        if ($task) { $info = Get-ScheduledTaskInfo -TaskName $taskName -TaskPath '\' }
        [pscustomobject]@{
            Task = $taskName
            TaskState = $(if ($task) { [string]$task.State } else { 'Not installed' })
            Store = $StoreRoot
            LastTaskResult = $(if ($info) { $info.LastTaskResult } else { $null })
            NextRunAt = $(if ($info) { $info.NextRunTime } else { $null })
            State = (Get-StatusValue $status 'state')
            LastAttemptAt = (Get-StatusValue $status 'lastAttemptAt')
            LastLocalCommit = (Get-StatusValue $status 'lastLocalCommit')
            LastLocalAt = (Get-StatusValue $status 'lastLocalAt')
            LastRemoteCommit = (Get-StatusValue $status 'lastRemoteCommit')
            LastRemoteAt = (Get-StatusValue $status 'lastRemoteAt')
            ExcludedCount = (Get-StatusValue $status 'excludedCount')
            Error = (Get-StatusValue $status 'error')
        }
    }
    'Run' {
        $null = Assert-InstalledIntegrity
        $task = Get-OwnedTask
        if (-not $task) { throw 'The checkpoint task is not installed.' }
        if ($task.State -eq 'Disabled') { throw 'The checkpoint task is disabled. Enable it after verification before using Run.' }
        Start-ScheduledTask -TaskName $taskName -TaskPath '\'
        Write-Output 'Checkpoint run requested. Use Status to inspect its result.'
    }
    'Enable' {
        $config = Assert-InstalledIntegrity
        if (-not (Get-OwnedTask)) { throw 'The checkpoint task is not installed.' }
        if ($config.remoteEnabled -ne $true) { throw 'Reinstall with RemoteVerified after reviewing the remote integration before enabling scheduling.' }
        $null = Enable-ScheduledTask -TaskName $taskName -TaskPath '\'
        Write-Output 'Portalink checkpoint scheduling is enabled.'
    }
    'Disable' {
        if (-not (Get-OwnedTask)) { throw 'The checkpoint task is not installed.' }
        $null = Disable-ScheduledTask -TaskName $taskName -TaskPath '\'
        Write-Output 'Portalink checkpoint scheduling is disabled. An already running checkpoint may finish.'
    }
}
