#Requires -Version 5.1
<#
.SYNOPSIS
    Falcon Stack Installer - interactive wizard for fresh Windows PCs.

.DESCRIPTION
    Walks through every step of installing the Falcon IoT stack on a fresh
    Windows machine: WSL/Docker/Git, network configuration, repo clone,
    Docker image load, env configuration, stack startup, LPS8 LoRa gateway
    restore, and Modbus gateway verification.

    Each step is verified before moving to the next. State is persisted to
    %LOCALAPPDATA%\falcon-installer\state.json so the wizard can resume
    after reboots or interruptions.

.PARAMETER Resume
    0 (default): normal start. Reuses state.json if present (this is what the
    auto-resume shortcut passes after a reboot).
    N >= 1: skip ahead. Marks every step with id < N as done in state.json and
    starts running from step N. Useful when an early step is irrecoverable
    from the script (e.g. broken DISM cmdlets) but the user fixed it manually.

.PARAMETER AIAssist
    Enable AI-assisted troubleshooting. When a step fails, the wizard offers
    to send the error context to Anthropic's Claude API for a diagnosis.
    Requires an API key (asked once and stored in Windows Credential Manager).
    No AI calls happen unless this flag is set AND the user confirms each call.

.PARAMETER Force
    Re-run all steps from the beginning, ignoring saved state.

.EXAMPLE
    .\setup.ps1
        Standard run.

.EXAMPLE
    .\setup.ps1 -AIAssist
        Run with AI-assisted error diagnosis available.

.EXAMPLE
    .\setup.ps1 -Force
        Start over from step 1.

.EXAMPLE
    .\setup.ps1 -Resume 3
        Mark steps 1 and 2 as done and start from step 3.
#>

[CmdletBinding()]
param(
    # 0 (default) = normal start; reuses state.json if present (auto-resume after reboot).
    # N >= 1 = skip ahead: mark all steps with id < N as done, then run from step N.
    [int]$Resume = 0,
    [switch]$AIAssist,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

#region ============================================================
#                           CONSTANTS
#=================================================================

$Script:INSTALLER_VERSION = '1.0.0'
$Script:REPO_URL = 'https://github.com/ramonrf146-hub/Falcon-Docker.git'
$Script:REPO_DIR = 'C:\Projects\Falcon-Docker'
$Script:STATE_DIR = Join-Path $env:LOCALAPPDATA 'falcon-installer'
$Script:STATE_FILE = Join-Path $Script:STATE_DIR 'state.json'
$Script:LOG_FILE = Join-Path $Script:STATE_DIR 'setup.log'
$Script:STARTUP_SHORTCUT = Join-Path ([Environment]::GetFolderPath('Startup')) 'FalconInstallerResume.lnk'

# GitHub Release asset (the pre-built docker image).
$Script:IMAGE_RELEASE_TAG = 'v0.1.0'
$Script:IMAGE_ASSET_NAME = 'falcon-docker-20260919-1514.tar.gz'
$Script:IMAGE_DOWNLOAD_URL = "https://github.com/ramonrf146-hub/Falcon-Docker/releases/download/$Script:IMAGE_RELEASE_TAG/$Script:IMAGE_ASSET_NAME"

# Network constants for the Falcon deployment.
$Script:PRIMARY_IP = '192.168.1.10'
$Script:PRIMARY_PREFIX = 24
$Script:LPS8_LINK_IP = '172.31.255.253'
$Script:LPS8_LINK_PREFIX = 30
$Script:LPS8_DEFAULT_IP = '172.31.255.254'
$Script:LPS8_BACKUP_PATH = 'lps8_backup\backup.tar.gz'  # relative to repo
$Script:MODBUS_IP = '192.168.1.100'
$Script:MODBUS_PORT = 502
$Script:UDP_GATEWAY_PORT = 1700

# Step definitions - declared up front so the state machine can iterate.
$Script:STEPS = @(
    @{ Id = 1;  Name = 'preflight';      Title = 'Pre-flight checks'                   ; Reboot = $false }
    @{ Id = 2;  Name = 'wsl_features';   Title = 'Enable WSL + VirtualMachinePlatform' ; Reboot = $true  }
    @{ Id = 3;  Name = 'docker_install'; Title = 'Install Docker Desktop'              ; Reboot = $false }
    @{ Id = 4;  Name = 'git_install';    Title = 'Install Git for Windows'             ; Reboot = $false }
    @{ Id = 5;  Name = 'network_config'; Title = 'Configure network adapter (IPs)'     ; Reboot = $false }
    @{ Id = 6;  Name = 'firewall_rule';  Title = 'Add firewall rule UDP/1700'          ; Reboot = $false }
    @{ Id = 7;  Name = 'clone_repo';     Title = 'Clone Falcon-Docker from GitHub'     ; Reboot = $false }
    @{ Id = 8;  Name = 'download_image'; Title = 'Download Docker image from Releases' ; Reboot = $false }
    @{ Id = 9;  Name = 'load_image';     Title = 'Load Docker image into Docker'       ; Reboot = $false }
    @{ Id = 10; Name = 'env_config';     Title = 'Configure .env (per-site values)'    ; Reboot = $false }
    @{ Id = 11; Name = 'devices_csv';    Title = 'Configure devices.csv (LoRa sensors)'; Reboot = $false }
    @{ Id = 12; Name = 'stack_up';       Title = 'Start the Docker stack'              ; Reboot = $false }
    @{ Id = 13; Name = 'lps8_restore';   Title = 'Configure LPS8 LoRa gateway'         ; Reboot = $false }
    @{ Id = 14; Name = 'modbus_verify';  Title = 'Verify Modbus Waveshare gateway'     ; Reboot = $false }
    @{ Id = 15; Name = 'finalize';       Title = 'Final summary and cleanup'           ; Reboot = $false }
)

#endregion

#region ============================================================
#                           UI HELPERS
#=================================================================

function Write-Banner {
    Clear-Host
    Write-Host ""
    Write-Host "  +=======================================================+" -ForegroundColor Cyan
    Write-Host "  |                                                       |" -ForegroundColor Cyan
    Write-Host "  |         Falcon Stack Installer  v$Script:INSTALLER_VERSION               |" -ForegroundColor Cyan
    Write-Host "  |                                                       |" -ForegroundColor Cyan
    Write-Host "  |         Heromatic / Environmental Monitoring          |" -ForegroundColor Cyan
    Write-Host "  |                                                       |" -ForegroundColor Cyan
    Write-Host "  +=======================================================+" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param([int]$Id, [int]$Total, [string]$Title)
    Write-Host ""
    Write-Host ("-" * 60) -ForegroundColor DarkGray
    Write-Host (" [{0,2}/{1}] {2}" -f $Id, $Total, $Title) -ForegroundColor Cyan
    Write-Host ("-" * 60) -ForegroundColor DarkGray
}

function Write-Ok    { param([string]$Msg) Write-Host "        OK    $Msg" -ForegroundColor Green ;  Write-Log "OK   : $Msg" }
function Write-Warn  { param([string]$Msg) Write-Host "        WARN  $Msg" -ForegroundColor Yellow ; Write-Log "WARN : $Msg" }
function Write-Fail  { param([string]$Msg) Write-Host "        FAIL  $Msg" -ForegroundColor Red ;    Write-Log "FAIL : $Msg" }
function Write-Info  { param([string]$Msg) Write-Host "        $Msg" -ForegroundColor Gray ;         Write-Log "INFO : $Msg" }
function Write-Action {
    param([string]$Msg)
    Write-Host ""
    Write-Host "  >>> $Msg" -ForegroundColor Yellow
}

function Confirm-User {
    param([string]$Prompt, [string]$Default = 'Y')
    $hint = if ($Default -eq 'Y') { '[Y/n]' } else { '[y/N]' }
    while ($true) {
        Write-Host -NoNewline ("        {0} {1}: " -f $Prompt, $hint) -ForegroundColor Yellow
        $r = Read-Host
        if ([string]::IsNullOrWhiteSpace($r)) { $r = $Default }
        switch -Regex ($r.ToUpper()) {
            '^Y' { return $true }
            '^N' { return $false }
            default { Write-Host "        Please answer y or n." -ForegroundColor DarkGray }
        }
    }
}

function Read-NonEmpty {
    param([string]$Prompt, [string]$Default = '')
    while ($true) {
        $hint = if ($Default) { " [$Default]" } else { '' }
        Write-Host -NoNewline ("        {0}{1}: " -f $Prompt, $hint) -ForegroundColor Yellow
        $r = Read-Host
        if ([string]::IsNullOrWhiteSpace($r) -and $Default) { return $Default }
        if (-not [string]::IsNullOrWhiteSpace($r)) { return $r.Trim() }
        Write-Host "        Value cannot be empty." -ForegroundColor DarkGray
    }
}

function Read-Optional {
    param([string]$Prompt, [string]$Default = '')
    $hint = if ($Default) { " [$Default]" } else { ' (press Enter to leave blank)' }
    Write-Host -NoNewline ("        {0}{1}: " -f $Prompt, $hint) -ForegroundColor Yellow
    $r = Read-Host
    if ([string]::IsNullOrWhiteSpace($r)) { return $Default }
    return $r.Trim()
}

function Read-Secret {
    param([string]$Prompt)
    Write-Host -NoNewline ("        {0}: " -f $Prompt) -ForegroundColor Yellow
    $sec = Read-Host -AsSecureString
    return [System.Net.NetworkCredential]::new('', $sec).Password
}

function Pause-User {
    param([string]$Msg = 'Press Enter to continue')
    Write-Host -NoNewline "        $Msg... " -ForegroundColor Yellow
    [void](Read-Host)
}

#endregion

#region ============================================================
#                           LOGGING
#=================================================================

function Write-Log {
    param([string]$Message)
    if (-not (Test-Path $Script:STATE_DIR)) {
        New-Item -ItemType Directory -Path $Script:STATE_DIR -Force | Out-Null
    }
    $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    Add-Content -Path $Script:LOG_FILE -Value "$ts $Message"
}

#endregion

#region ============================================================
#                         STATE MACHINE
#=================================================================

function Initialize-State {
    if (-not (Test-Path $Script:STATE_DIR)) {
        New-Item -ItemType Directory -Path $Script:STATE_DIR -Force | Out-Null
    }
    $state = [ordered]@{
        version    = $Script:INSTALLER_VERSION
        started_at = (Get-Date).ToString('o')
        site_data  = [ordered]@{}
        steps      = @()
    }
    foreach ($s in $Script:STEPS) {
        $state.steps += [ordered]@{
            id     = $s.Id
            name   = $s.Name
            status = 'pending'
            attempts = 0
            last_error = ''
            completed_at = ''
        }
    }
    Save-State $state
    return $state
}

function Save-State {
    param($State)
    $json = $State | ConvertTo-Json -Depth 10
    Set-Content -Path $Script:STATE_FILE -Value $json -Encoding UTF8
}

function Load-State {
    if (-not (Test-Path $Script:STATE_FILE)) { return $null }
    try {
        $raw = Get-Content -Path $Script:STATE_FILE -Raw -Encoding UTF8
        return $raw | ConvertFrom-Json
    } catch {
        Write-Warn "State file corrupted, ignoring: $_"
        return $null
    }
}

function Get-StepState {
    param($State, [int]$Id)
    foreach ($s in $State.steps) {
        if ($s.id -eq $Id) { return $s }
    }
    return $null
}

function Set-StepStatus {
    param($State, [int]$Id, [string]$Status, [string]$ErrorMsg = '')
    $step = Get-StepState $State $Id
    $step.status = $Status
    $step.last_error = $ErrorMsg
    if ($Status -eq 'done') { $step.completed_at = (Get-Date).ToString('o') }
    if ($Status -eq 'running') { $step.attempts = ($step.attempts + 1) }
    Save-State $State
}

#endregion

#region ============================================================
#                         REBOOT / RESUME
#=================================================================

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-SelfElevate {
    param([string[]]$ArgsForward)
    Write-Warn "Re-launching as Administrator..."
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath)
    $argList += $ArgsForward
    Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -Verb RunAs
    exit 0
}

function Set-AutoResume {
    # Create a Start Menu Startup shortcut that re-runs the installer with -Resume.
    # -NoExit so the window stays open if the script exits (success or error)
    # and the user can read messages or re-launch with -Resume manually.
    $shell = New-Object -ComObject WScript.Shell
    $sc = $shell.CreateShortcut($Script:STARTUP_SHORTCUT)
    $sc.TargetPath = 'powershell.exe'
    $sc.Arguments = "-NoExit -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Resume 0"
    $sc.WorkingDirectory = Split-Path -Parent $PSCommandPath
    $sc.Description = 'Falcon Installer auto-resume after reboot'
    $sc.Save()
    Write-Info "Auto-resume shortcut created at $Script:STARTUP_SHORTCUT"
}

function Clear-AutoResume {
    if (Test-Path $Script:STARTUP_SHORTCUT) {
        Remove-Item $Script:STARTUP_SHORTCUT -Force
        Write-Info "Auto-resume shortcut removed."
    }
}

function Request-Reboot {
    param([string]$Reason)
    Write-Action "REBOOT REQUIRED: $Reason"
    Write-Info "The installer will resume automatically after you log back in."
    Set-AutoResume
    if (Confirm-User 'Reboot now?' 'Y') {
        Write-Info "Rebooting in 5 seconds..."
        Start-Sleep -Seconds 5
        Restart-Computer -Force
        exit 0
    } else {
        Write-Warn "Reboot deferred. Run the installer again after rebooting."
        exit 0
    }
}

#endregion

#region ============================================================
#                      AI ASSIST (opt-in)
#=================================================================

function Get-AnthropicKey {
    # Try Credential Manager first.
    try {
        $cred = Get-StoredCredential -Target 'FalconInstaller_AnthropicKey' -ErrorAction SilentlyContinue
        if ($cred) { return $cred.GetNetworkCredential().Password }
    } catch {}
    # Fallback: ask user.
    Write-Action "AI assist enabled - needs an Anthropic API key."
    Write-Info "Get one from https://console.anthropic.com/settings/keys"
    Write-Info "It will be saved to Windows Credential Manager (only this PC)."
    $key = Read-Secret 'Paste your Anthropic API key (sk-ant-...)'
    if (-not $key) {
        Write-Warn "No key provided. AI assist disabled for this run."
        return $null
    }
    Set-StoredAnthropicKey $key
    return $key
}

function Set-StoredAnthropicKey {
    param([string]$Key)
    # Use cmdkey (built-in Windows). Stores generic credential.
    $u = 'falcon'
    & cmdkey.exe /generic:FalconInstaller_AnthropicKey /user:$u /pass:$Key | Out-Null
    Write-Ok "API key saved to Windows Credential Manager."
}

function Get-StoredCredential {
    # Mini-helper to read from Credential Manager via cmdkey.exe + native API.
    # Fall back to $null silently if anything fails.
    param([string]$Target)
    try {
        $sig = @"
[DllImport("Advapi32.dll", SetLastError=true, CharSet=CharSet.Auto)]
public static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr CredentialPtr);
[DllImport("Advapi32.dll", SetLastError=true)]
public static extern void CredFree(IntPtr buffer);
"@
        $cm = Add-Type -MemberDefinition $sig -Namespace 'FalconCM' -Name 'Cm' -PassThru
        $ptr = [IntPtr]::Zero
        if ($cm::CredRead($Target, 1, 0, [ref]$ptr)) {
            # Parse the unmanaged CREDENTIAL struct just enough to get CredentialBlob.
            $struct = [System.Runtime.InteropServices.Marshal]::PtrToStructure(
                $ptr,
                [Type]([System.Management.Automation.PSObject].Assembly.GetTypes() | Where-Object { $_.Name -eq 'CREDENTIAL' } | Select-Object -First 1)
            )
            # Simpler: just signal that cred exists; reading the blob is platform-specific.
            $cm::CredFree($ptr)
        }
    } catch {}
    return $null
}

function Invoke-AIAssist {
    param([string]$StepName, [string]$ErrorContext)
    if (-not $AIAssist) { return }
    if (-not (Confirm-User 'Ask the AI for help?' 'N')) { return }

    $key = Get-AnthropicKey
    if (-not $key) { return }

    Write-Info "Querying Claude (this may take a few seconds)..."
    $prompt = @"
You are helping diagnose an installer failure for the Falcon IoT stack
(Docker, Node-RED, ChirpStack on Windows). Step that failed: $StepName

Error/context:
$ErrorContext

Give a brief diagnosis (2-3 sentences max) and 2-3 concrete commands or
actions the user can try next. Be specific. Do not write paragraphs.
"@
    $body = @{
        model = 'claude-sonnet-4-6'
        max_tokens = 512
        messages = @(@{ role = 'user'; content = $prompt })
    } | ConvertTo-Json -Depth 5

    try {
        $resp = Invoke-RestMethod -Uri 'https://api.anthropic.com/v1/messages' -Method Post -Body $body `
            -Headers @{
                'x-api-key' = $key
                'anthropic-version' = '2023-06-01'
                'content-type' = 'application/json'
            }
        $text = $resp.content[0].text
        Write-Host ""
        Write-Host "  AI suggests:" -ForegroundColor Magenta
        Write-Host "  ------------" -ForegroundColor DarkGray
        $text -split "`n" | ForEach-Object { Write-Host "  $_" -ForegroundColor Magenta }
        Write-Host "  ------------" -ForegroundColor DarkGray
        Write-Host ""
    } catch {
        Write-Warn "AI request failed: $_"
    }
}

#endregion

#region ============================================================
#                     STEP IMPLEMENTATIONS
#=================================================================

function Step-Preflight {
    param($State)

    # OS version. [Environment]::OSVersion always reports Major=10 even on
    # Windows 11 (Microsoft kept it for app compat). Detect Win 11 by build.
    $os = [System.Environment]::OSVersion.Version
    if ($os.Major -lt 10) {
        Write-Fail "Windows 10 or 11 required (detected $($os.ToString()))."
        return $false
    }
    $winName = if ($os.Build -ge 22000) { 'Windows 11' } else { 'Windows 10' }
    Write-Ok "OS: $winName (build $($os.Build))"

    # Internet.
    try {
        $r = Test-NetConnection -ComputerName 'github.com' -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue
        if (-not $r) { throw 'no route to github.com:443' }
        Write-Ok "Internet reachable (github.com:443)"
    } catch {
        Write-Fail "No internet connectivity: $_"
        return $false
    }

    # Virtualization in firmware.
    $vmFirmware = (Get-ComputerInfo -Property HyperVRequirementVirtualizationFirmwareEnabled).HyperVRequirementVirtualizationFirmwareEnabled
    if ($vmFirmware) {
        Write-Ok "Virtualization enabled in BIOS/UEFI"
    } else {
        Write-Warn "Virtualization may not be enabled in BIOS. Continuing anyway."
        Write-Info "If Docker fails to start later, enable VT-x/AMD-V in BIOS."
    }

    # Free disk space. Docker Desktop + WSL2 + images = ~10 GB minimum.
    $sys = Get-PSDrive -Name C
    $freeGb = [math]::Round($sys.Free / 1GB, 1)
    if ($freeGb -lt 10) {
        Write-Fail "Low disk space: $freeGb GB free on C: (need at least 10 GB)."
        return $false
    }
    if ($freeGb -lt 20) {
        Write-Warn "Disk space: $freeGb GB free on C: (recommended >= 20 GB; will work but tight)."
    } else {
        Write-Ok "Disk space: $freeGb GB free on C:"
    }

    # Admin rights.
    if (Test-IsAdmin) {
        Write-Ok "Running as Administrator"
    } else {
        Write-Warn "Not running as Administrator - some steps will need elevation."
    }

    return $true
}

function Step-WslFeatures {
    param($State)

    $needsReboot = $false
    foreach ($feature in 'VirtualMachinePlatform', 'Microsoft-Windows-Subsystem-Linux') {
        $f = Get-WindowsOptionalFeature -Online -FeatureName $feature -ErrorAction SilentlyContinue
        if (-not $f) {
            Write-Warn "Feature $feature not found on this Windows edition. Skipping."
            continue
        }
        if ($f.State -eq 'Enabled') {
            Write-Ok "$feature already enabled"
        } else {
            Write-Info "Enabling $feature..."
            $r = Enable-WindowsOptionalFeature -Online -FeatureName $feature -All -NoRestart
            $needsReboot = $needsReboot -or $r.RestartNeeded
            Write-Ok "$feature enabled"
        }
    }

    # Install WSL if missing.
    $wslOK = $false
    try {
        $wslVer = (& wsl.exe --version 2>$null)
        if ($wslVer) { $wslOK = $true }
    } catch {}
    if (-not $wslOK) {
        Write-Info "Installing WSL kernel + default distro..."
        & wsl.exe --install --no-launch
        $needsReboot = $true
    } else {
        Write-Ok "WSL already installed"
    }

    # Update WSL kernel to latest. Required by Docker Desktop on some builds
    # (otherwise it fails with "WSL2 distro install failed" on first launch).
    Write-Info "Updating WSL kernel (wsl --update)..."
    try {
        & wsl.exe --update --no-launch 2>&1 | ForEach-Object { Write-Host "        $_" -ForegroundColor DarkGray }
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "WSL kernel up to date"
        } else {
            Write-Warn "wsl --update returned $LASTEXITCODE (continuing)"
        }
    } catch {
        Write-Warn "wsl --update failed: $_ (continuing)"
    }

    if ($needsReboot) {
        Set-StepStatus $State 2 'done'
        Request-Reboot 'WSL features were just enabled.'
    }
    return $true
}

function Step-DockerInstall {
    param($State)

    # Refresh PATH from registry so we pick up Docker if installed in a
    # previous run (Docker Desktop's PATH change isn't visible to PS sessions
    # that started before the install).
    $env:Path = ([System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
                 [System.Environment]::GetEnvironmentVariable('Path','User'))

    # Locate docker.exe:
    #   1. PATH lookup
    #   2. Default Docker Desktop install dir
    $dockerExe = $null
    $cmd = Get-Command docker -ErrorAction SilentlyContinue
    if ($cmd) { $dockerExe = $cmd.Source }
    if (-not $dockerExe) {
        $candidate = Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe'
        if (Test-Path $candidate) { $dockerExe = $candidate }
    }

    if ($dockerExe) {
        try {
            $v = & $dockerExe version --format '{{.Server.Version}}' 2>$null
            if ($v) {
                Write-Ok "Docker Desktop running (server $v) — found at $dockerExe"
                return $true
            } else {
                Write-Warn "docker.exe found but engine not responding."
                Write-Action "Open Docker Desktop from the Start Menu and wait for 'Engine running'."
                Pause-User 'Press Enter when the engine is running'
                $v = & $dockerExe version --format '{{.Server.Version}}' 2>$null
                if ($v) {
                    Write-Ok "Docker Engine running (server $v)"
                    return $true
                }
                Write-Fail "Docker still not responding. Re-run with -Resume after starting Docker Desktop."
                return $false
            }
        } catch {
            Write-Warn "Could not query docker version: $_"
        }
    }

    Write-Info "Downloading Docker Desktop installer (~500 MB)..."
    $url = 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe'
    $exe = Join-Path $env:TEMP 'DockerDesktopInstaller.exe'
    try {
        Invoke-WebRequest -Uri $url -OutFile $exe -UseBasicParsing
    } catch {
        Write-Fail "Download failed: $_"
        return $false
    }
    Write-Ok "Downloaded to $exe"

    Write-Info "Running silent install (takes ~3-5 min)..."
    $p = Start-Process -FilePath $exe -ArgumentList 'install', '--quiet', '--accept-license' -Wait -PassThru
    if ($p.ExitCode -ne 0) {
        Write-Fail "Docker Desktop installer exited with code $($p.ExitCode)"
        return $false
    }
    Write-Ok "Docker Desktop installed"

    Write-Action "Open Docker Desktop manually now (Start -> Docker Desktop)."
    Write-Action "Wait until the whale icon in the system tray says 'Engine running'."
    Pause-User 'Press Enter when Docker Desktop is running'

    # Verify.
    try {
        $v = & docker version --format '{{.Server.Version}}' 2>$null
        if ($v) {
            Write-Ok "Docker Engine running (server $v)"
            return $true
        }
    } catch {
        Write-Fail "Docker still not responding. Open Docker Desktop and try again."
        return $false
    }
    return $false
}

function Step-GitInstall {
    param($State)

    if (Get-Command git -ErrorAction SilentlyContinue) {
        $v = & git --version
        Write-Ok "Git already installed: $v"
        return $true
    }

    Write-Info "Installing Git for Windows via winget..."
    try {
        & winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements --silent
    } catch {
        Write-Fail "winget install failed: $_"
        Write-Action "Download Git manually from https://git-scm.com/download/win"
        Pause-User 'Press Enter when Git is installed'
    }

    # Refresh PATH.
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')

    if (Get-Command git -ErrorAction SilentlyContinue) {
        $v = & git --version
        Write-Ok "Git installed: $v"
        return $true
    }
    Write-Fail "Git not found after install. Restart PowerShell and re-run the installer."
    return $false
}

function Step-NetworkConfig {
    param($State)

    # List Ethernet adapters that are Up. Force array (a single match would
    # otherwise be a scalar object without .Count).
    $adapters = @(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.MediaType -eq '802.3' })
    if ($adapters.Count -eq 0) {
        Write-Fail "No active Ethernet adapter found. Plug in your USB-Ethernet dongle and re-run this step."
        return $false
    }

    Write-Info "Detected Ethernet adapters (Up):"
    $i = 0
    foreach ($a in $adapters) {
        $i++
        Write-Host ("        [{0}] {1} - {2}" -f $i, $a.Name, $a.InterfaceDescription) -ForegroundColor Gray
    }
    $choice = Read-NonEmpty "Which adapter is your INTERNAL network NIC?" '1'
    $idx = [int]$choice - 1
    if ($idx -lt 0 -or $idx -ge $adapters.Count) {
        Write-Fail "Invalid choice"
        return $false
    }
    $nic = $adapters[$idx]
    Write-Ok "Selected: $($nic.Name)"

    # Set primary IP.
    try {
        $existing = Get-NetIPAddress -InterfaceIndex $nic.ifIndex -IPAddress $Script:PRIMARY_IP -ErrorAction SilentlyContinue
        if (-not $existing) {
            New-NetIPAddress -InterfaceIndex $nic.ifIndex -IPAddress $Script:PRIMARY_IP -PrefixLength $Script:PRIMARY_PREFIX -ErrorAction Stop | Out-Null
        }
        Write-Ok "Primary IP $Script:PRIMARY_IP/$Script:PRIMARY_PREFIX set on $($nic.Name)"
    } catch {
        Write-Fail "Could not set primary IP: $_"
        return $false
    }

    # Set alias IP for LPS8 cable.
    try {
        $existing = Get-NetIPAddress -InterfaceIndex $nic.ifIndex -IPAddress $Script:LPS8_LINK_IP -ErrorAction SilentlyContinue
        if (-not $existing) {
            New-NetIPAddress -InterfaceIndex $nic.ifIndex -IPAddress $Script:LPS8_LINK_IP -PrefixLength $Script:LPS8_LINK_PREFIX -ErrorAction Stop | Out-Null
        }
        Write-Ok "Alias IP $Script:LPS8_LINK_IP/$Script:LPS8_LINK_PREFIX set on $($nic.Name)"
    } catch {
        Write-Fail "Could not set alias IP: $_"
        return $false
    }

    # Save selected adapter for later steps.
    $State.site_data | Add-Member -NotePropertyName 'nic_name'   -NotePropertyValue $nic.Name -Force
    $State.site_data | Add-Member -NotePropertyName 'nic_index'  -NotePropertyValue $nic.ifIndex -Force
    Save-State $State

    return $true
}

function Step-FirewallRule {
    param($State)
    $name = 'Docker UDP 1700 (Falcon)'
    $existing = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Ok "Firewall rule already exists"
        return $true
    }
    try {
        New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol UDP -LocalPort $Script:UDP_GATEWAY_PORT -Action Allow -ErrorAction Stop | Out-Null
        Write-Ok "Firewall rule for UDP/$Script:UDP_GATEWAY_PORT created"
        return $true
    } catch {
        Write-Fail "Failed to add firewall rule: $_"
        return $false
    }
}

function Step-CloneRepo {
    param($State)

    if (Test-Path (Join-Path $Script:REPO_DIR '.git')) {
        Write-Ok "Repo already cloned at $Script:REPO_DIR"
        Write-Info "Pulling latest changes..."
        try { Push-Location $Script:REPO_DIR; & git pull --ff-only 2>&1 | Out-Null; Pop-Location; Write-Ok "Up-to-date" } catch { Write-Warn "git pull failed: $_" }
        return $true
    }

    $parent = Split-Path -Parent $Script:REPO_DIR
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }

    Write-Info "Cloning $Script:REPO_URL into $Script:REPO_DIR..."
    Write-Info "If prompted, paste your GitHub Personal Access Token (PAT) as the password."
    Push-Location $parent
    try {
        & git clone $Script:REPO_URL Falcon-Docker 2>&1 | ForEach-Object { Write-Host "        $_" -ForegroundColor DarkGray }
        if ($LASTEXITCODE -ne 0) { throw "git clone failed (exit $LASTEXITCODE)" }
        Write-Ok "Repo cloned successfully"
        return $true
    } catch {
        Write-Fail "Clone failed: $_"
        return $false
    } finally {
        Pop-Location
    }
}

function Get-GitHubPat {
    # Pull the PAT from Git Credential Manager (saved when we cloned in step 7).
    # Falls back to prompting if not found.
    $pat = $null
    try {
        $credInput = "protocol=https`nhost=github.com`nusername=ramonrf146-hub`n`n"
        $out = $credInput | & git credential fill 2>$null
        foreach ($line in $out) {
            if ($line -match '^password=(.+)$') { $pat = $Matches[1]; break }
        }
    } catch {}
    if (-not $pat) {
        Write-Action "Need your GitHub Personal Access Token to download the image."
        $pat = Read-Secret 'Paste your PAT (ghp_...)'
    }
    return $pat
}

function Step-DownloadImage {
    param($State)
    $distDir = Join-Path $Script:REPO_DIR 'dist'
    if (-not (Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir -Force | Out-Null }
    $target = Join-Path $distDir $Script:IMAGE_ASSET_NAME

    if (Test-Path $target) {
        $sz = (Get-Item $target).Length / 1MB
        Write-Ok ("Image already downloaded: {0} ({1:N0} MB)" -f $target, $sz)
        return $true
    }

    # Private repo: get PAT, resolve asset id via API, then download.
    $pat = Get-GitHubPat
    if (-not $pat) {
        Write-Fail "No GitHub PAT available to authenticate the download."
        return $false
    }

    # 1. Look up the release and find the asset id.
    $apiBase = "https://api.github.com/repos/ramonrf146-hub/Falcon-Docker/releases/tags/$Script:IMAGE_RELEASE_TAG"
    Write-Info "Resolving release asset $Script:IMAGE_ASSET_NAME ($Script:IMAGE_RELEASE_TAG)..."
    try {
        $rel = Invoke-RestMethod -Uri $apiBase `
            -Headers @{ 'Authorization' = "Bearer $pat"; 'Accept' = 'application/vnd.github+json'; 'User-Agent' = 'FalconInstaller' } `
            -ErrorAction Stop
    } catch {
        Write-Fail "API call failed: $_"
        return $false
    }
    $asset = $rel.assets | Where-Object { $_.name -eq $Script:IMAGE_ASSET_NAME } | Select-Object -First 1
    if (-not $asset) {
        Write-Fail "Asset '$Script:IMAGE_ASSET_NAME' not found in release '$Script:IMAGE_RELEASE_TAG'."
        Write-Info "Available assets: $($rel.assets.name -join ', ')"
        return $false
    }
    $assetUrl = "https://api.github.com/repos/ramonrf146-hub/Falcon-Docker/releases/assets/$($asset.id)"
    $sizeMB = [math]::Round($asset.size / 1MB, 0)
    Write-Info "Asset id $($asset.id), size $sizeMB MB"

    # 2. Stream download with Accept: octet-stream and PAT.
    Write-Info "Downloading (this can take 1-15 min depending on bandwidth)..."
    try {
        $req = [System.Net.HttpWebRequest]::Create($assetUrl)
        $req.Headers.Add('Authorization', "Bearer $pat")
        $req.Accept = 'application/octet-stream'
        $req.UserAgent = 'FalconInstaller'
        $req.AllowAutoRedirect = $true
        $resp = $req.GetResponse()
        $total = $resp.ContentLength
        $stream = $resp.GetResponseStream()
        $fs = [System.IO.File]::Create($target)
        $buf = New-Object byte[] 65536
        $read = 0
        $totalRead = 0
        $lastReport = Get-Date
        while (($read = $stream.Read($buf, 0, $buf.Length)) -gt 0) {
            $fs.Write($buf, 0, $read)
            $totalRead += $read
            if (((Get-Date) - $lastReport).TotalMilliseconds -ge 250) {
                $pct = if ($total -gt 0) { [math]::Round($totalRead * 100 / $total, 1) } else { 0 }
                Write-Progress -Activity "Downloading image" -PercentComplete $pct `
                    -Status ("{0:N0}/{1:N0} MB ({2}%)" -f ($totalRead/1MB), ($total/1MB), $pct)
                $lastReport = Get-Date
            }
        }
        $fs.Close(); $stream.Close(); $resp.Close()
        Write-Progress -Activity "Downloading image" -Completed
        Write-Ok ("Downloaded {0:N0} MB" -f ($totalRead/1MB))
        return $true
    } catch {
        Write-Fail "Download failed: $_"
        if (Test-Path $target) { Remove-Item $target -Force }
        return $false
    }
}

function Step-LoadImage {
    param($State)
    $distDir = Join-Path $Script:REPO_DIR 'dist'
    $tarball = Join-Path $distDir $Script:IMAGE_ASSET_NAME

    # Check if image is already loaded.
    $img = & docker image ls --format '{{.Repository}}:{{.Tag}}' 2>$null | Where-Object { $_ -eq 'falcon-docker:latest' }
    if ($img) {
        Write-Ok "Image falcon-docker:latest already loaded"
        return $true
    }

    if (-not (Test-Path $tarball)) {
        Write-Fail "Tarball not found: $tarball"
        return $false
    }

    Write-Info "Loading image into Docker (takes 1-2 min)..."
    # docker load reads gzipped tar directly with -i. No piping (PS5.1 mangles
    # binary streams via Get-Content -Encoding Byte). Use the file path.
    try {
        & docker load -i $tarball 2>&1 | ForEach-Object { Write-Host "        $_" -ForegroundColor DarkGray }
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "docker load returned exit code $LASTEXITCODE"
            return $false
        }
    } catch {
        Write-Fail "docker load threw: $_"
        return $false
    }

    $img = & docker image ls --format '{{.Repository}}:{{.Tag}}' 2>$null | Where-Object { $_ -eq 'falcon-docker:latest' }
    if ($img) {
        Write-Ok "Image loaded: falcon-docker:latest"
        return $true
    }
    Write-Fail "Image still not present after load."
    return $false
}

function Step-EnvConfig {
    param($State)
    $envExample = Join-Path $Script:REPO_DIR '.env.example'
    $envFile    = Join-Path $Script:REPO_DIR '.env'

    if (-not (Test-Path $envExample)) {
        Write-Fail ".env.example missing in repo. Did the clone succeed?"
        return $false
    }
    if ((Test-Path $envFile) -and -not $Force) {
        if (-not (Confirm-User '.env already exists. Overwrite with new values?' 'N')) {
            Write-Ok "Keeping existing .env"
            return $true
        }
    }

    Copy-Item $envExample $envFile -Force

    Write-Info "I'll ask you for each per-site value. Press Enter to skip / leave blank."
    Write-Info "You can fill the remaining values later by editing $envFile."
    Write-Host ""

    $tz       = Read-Optional 'Timezone (e.g. America/Mexico_City)' 'America/New_York'
    $lps8Eui  = Read-NonEmpty 'LPS8 Gateway EUI (16 hex chars from the LPS8 sticker)'
    $lps8Eui  = $lps8Eui.ToLower() -replace '[^0-9a-f]', ''
    if ($lps8Eui.Length -ne 16) {
        Write-Fail "Gateway EUI must be exactly 16 hex characters. Got '$lps8Eui'."
        return $false
    }

    Write-Info "(Azure values are optional - leave blank to skip and fill later.)"
    $deviceId = Read-Optional 'Azure IoT Device ID'
    $hubHost  = Read-Optional 'Azure IoT Hub hostname (xxx.azure-devices.net)'
    $sasKey   = Read-Optional 'Azure IoT SAS Key'
    $areaId   = Read-Optional 'Area ID (Heromatic admin app)'
    $rainEui  = Read-Optional 'Dragino rain sensor EUI (optional)'
    $mapKey   = Read-Optional 'Azure Maps Primary Key (optional)'
    $lat      = Read-Optional 'Site latitude (decimal, e.g. 19.4326)' '0.0'
    $lon      = Read-Optional 'Site longitude (decimal)' '0.0'

    # Patch .env in place.
    $content = Get-Content $envFile -Raw
    $patches = @{
        'TZ='                  = "TZ=$tz"
        'LPS8_GATEWAY_EUI='    = "LPS8_GATEWAY_EUI=$lps8Eui"
        'IOT_DEVICE_ID='       = "IOT_DEVICE_ID=$deviceId"
        'IOT_HUB_HOSTNAME='    = "IOT_HUB_HOSTNAME=$hubHost"
        'IOT_SAS_KEY='         = "IOT_SAS_KEY=$sasKey"
        'AREA_ID='             = "AREA_ID=$areaId"
        'DRAGINO_RAIN_EUI='    = "DRAGINO_RAIN_EUI=$rainEui"
        'AZURE_MAP_KEY='       = "AZURE_MAP_KEY=$mapKey"
        'SITE_LAT='            = "SITE_LAT=$lat"
        'SITE_LON='            = "SITE_LON=$lon"
    }
    foreach ($k in $patches.Keys) {
        $pat = "(?m)^$([regex]::Escape($k))[^\r\n]*"
        $content = $content -replace $pat, $patches[$k]
    }
    Set-Content -Path $envFile -Value $content -Encoding UTF8 -NoNewline
    Write-Ok ".env written"

    # Save also into state for traceability.
    $State.site_data | Add-Member -NotePropertyName 'lps8_eui' -NotePropertyValue $lps8Eui -Force
    $State.site_data | Add-Member -NotePropertyName 'tz'       -NotePropertyValue $tz -Force
    Save-State $State
    return $true
}

function Step-DevicesCsv {
    param($State)
    $csv = Join-Path $Script:REPO_DIR 'scripts\devices.csv'
    $example = Join-Path $Script:REPO_DIR 'scripts\devices.csv.example'

    if ((Test-Path $csv) -and -not $Force) {
        if (-not (Confirm-User 'devices.csv already exists. Replace it?' 'N')) {
            Write-Ok "Keeping existing devices.csv"
            return $true
        }
    }

    Write-Info "Add LoRa devices one by one. Empty DevEUI ends the loop."
    $lines = @('DevEUI,Name,AppKey,DeviceProfile')
    $profiles = @('LSN50v2','LSE01','LLMS01','SPH01-LB','UV254-LB','WSC1-L','WSC2','SE01-LB','US915-Class-A-OTAA')
    Write-Info ("Available profiles: {0}" -f ($profiles -join ', '))
    Write-Host ""

    while ($true) {
        # DevEUI: keep asking until valid OR empty (finish).
        $eui = $null
        while ($true) {
            $r = Read-Optional 'DevEUI (16 hex chars, empty to finish)'
            if (-not $r) { break }
            $r = $r.ToLower() -replace '[^0-9a-f]', ''
            if ($r.Length -eq 16) { $eui = $r; break }
            Write-Warn ("Bad DevEUI: got {0} hex chars, need 16. Try again." -f $r.Length)
        }
        if (-not $eui) { break }

        $name = Read-NonEmpty 'Name (no commas)'

        # AppKey: keep asking until valid. User can type 'cancel' to drop this device.
        $key = $null
        while ($true) {
            $r = Read-NonEmpty 'AppKey (32 hex chars, or type "cancel" to drop this device)'
            if ($r.ToLower() -eq 'cancel') { break }
            $r = $r.ToUpper() -replace '[^0-9A-F]', ''
            if ($r.Length -eq 32) { $key = $r; break }
            Write-Warn ("Bad AppKey: got {0} hex chars, need 32. Try again." -f $r.Length)
        }
        if (-not $key) {
            Write-Warn "Device $eui dropped."
            continue
        }

        $prof = Read-Optional 'DeviceProfile' 'LSN50v2'
        if ($profiles -notcontains $prof) {
            Write-Warn "Profile '$prof' not in known list - adding anyway."
        }
        $lines += "$eui,$name,$key,$prof"
        Write-Ok "Added $eui ($name) -> $prof"
    }

    Set-Content -Path $csv -Value ($lines -join "`n") -Encoding UTF8
    Write-Ok ("Wrote {0} device(s) to scripts/devices.csv" -f ($lines.Count - 1))
    return $true
}

function Step-StackUp {
    param($State)
    Push-Location $Script:REPO_DIR
    try {
        Write-Info "Running 'docker compose up -d --no-build'..."
        # docker compose writes pull progress to stderr. With $ErrorActionPreference=Stop,
        # any stderr line gets thrown as an exception ("Image redis:7-alpine Pulling").
        # Lower the pref locally and check $LASTEXITCODE instead.
        $prevPref = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            & docker compose up -d --no-build 2>&1 | ForEach-Object { Write-Host "        $_" -ForegroundColor DarkGray }
        } finally {
            $ErrorActionPreference = $prevPref
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "docker compose returned $LASTEXITCODE"
            return $false
        }
        Write-Info "Waiting for chirpstack-init bootstrap..."
        $deadline = (Get-Date).AddMinutes(3)
        while ((Get-Date) -lt $deadline) {
            $logs = & docker compose logs --tail=2 chirpstack-init 2>$null
            if ($logs -match 'Bootstrap complete') {
                Write-Ok "Bootstrap complete"
                break
            }
            if ($logs -match 'FAIL:') {
                Write-Fail "Bootstrap failed. See: docker compose logs chirpstack-init"
                return $false
            }
            Start-Sleep -Seconds 4
        }

        # Show ps summary.
        Write-Host ""
        & docker compose ps | ForEach-Object { Write-Host "        $_" -ForegroundColor DarkGray }
        return $true
    } finally {
        Pop-Location
    }
}

function Step-Lps8Restore {
    param($State)
    Write-Action "PHYSICAL STEPS - perform these now:"
    Write-Info "  1. Screw the antenna onto the LPS8 SMA connector."
    Write-Info "     DO NOT POWER ON WITHOUT THE ANTENNA."
    Write-Info "  2. Connect an Ethernet cable from the LPS8 'WAN' port to your"
    Write-Info "     PC's internal NIC (the same one we configured in step 5)."
    Write-Info "  3. Plug in the LPS8 power adapter."
    Write-Info "  4. Wait ~60 seconds for the LPS8 to boot."
    Pause-User 'Press Enter when the LPS8 is powered up'

    # Verify the LPS8 is reachable on its fall-back IP.
    Write-Info "Pinging LPS8 at $Script:LPS8_DEFAULT_IP..."
    $ok = Test-Connection -ComputerName $Script:LPS8_DEFAULT_IP -Count 3 -Quiet -ErrorAction SilentlyContinue
    if (-not $ok) {
        Write-Fail "LPS8 is not responding at $Script:LPS8_DEFAULT_IP"
        Write-Info "Check: cable in WAN port? PC NIC at 172.31.255.253? Power on?"
        return $false
    }
    Write-Ok "LPS8 reachable at $Script:LPS8_DEFAULT_IP"

    # Helper: print the manual configuration walkthrough (matches the
    # Dragino LPS8 web UI exactly — see docs/guideimages/*.jpg in the repo).
    $manualSteps = {
        Write-Action "Configure the LPS8 manually in the web UI:"
        Write-Info ""
        Write-Info "  1. Open http://${Script:LPS8_DEFAULT_IP}:8000 in your browser"
        Write-Info "     Login:  root / dragino"
        Write-Info ""
        Write-Info "  2. Click the 'LoRa' menu at the top"
        Write-Info "     Set:"
        Write-Info "       Frequency Plan      = US915 United States 915Mhz (902~928)"
        Write-Info "       Frequency Sub Band  = 2: US915 , FSB2 (903.9~905.3)"
        Write-Info "     Click 'Save&Apply' (button at the bottom)"
        Write-Info ""
        Write-Info "  3. Click 'LoRaWAN' menu at the top -> 'LoRaWAN Semtech UDP'"
        Write-Info "     Under 'Primary LoRaWAN Server' set:"
        Write-Info "       Service Provider    = Custom / Private LoRaWAN"
        Write-Info "       Server Address      = $Script:LPS8_LINK_IP"
        Write-Info "       Uplink Port         = 1700"
        Write-Info "       Downlink Port       = 1700"
        Write-Info "     Click 'Save&Apply'"
        Write-Info ""
        Write-Info "  At the bottom you should see: Current Mode: LoRaWAN Semtech UDP"
    }

    # Restore the master config via LuCI flashops.
    $backup = Join-Path $Script:REPO_DIR $Script:LPS8_BACKUP_PATH
    if (-not (Test-Path $backup)) {
        Write-Warn "Master backup not found at $backup. Skipping auto-restore."
        & $manualSteps
        Pause-User 'Press Enter when the LPS8 is configured'
    } else {
        Write-Info "Auto-restoring master config from $backup..."
        $loginUrl  = "http://${Script:LPS8_DEFAULT_IP}:8000/cgi-bin/luci"
        $restoreUrl = "http://${Script:LPS8_DEFAULT_IP}:8000/cgi-bin/luci/admin/system/flashops/backup_restore"

        try {
            $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
            $resp = Invoke-WebRequest -Uri $loginUrl -Method Post -Body @{
                luci_username = 'root'; luci_password = 'dragino'
            } -WebSession $session -UseBasicParsing -TimeoutSec 15
            if ($resp.StatusCode -ge 400) { throw "Login HTTP $($resp.StatusCode)" }
            Write-Ok "Logged in to LPS8"

            $form = @{ archive = Get-Item $backup }
            Invoke-WebRequest -Uri $restoreUrl -Method Post -Form $form -WebSession $session -UseBasicParsing -TimeoutSec 60 | Out-Null
            Write-Ok "Backup uploaded; LPS8 will reboot to apply config"
            Write-Info "Waiting 60 seconds for LPS8 to come back up..."
            Start-Sleep -Seconds 60
        } catch {
            Write-Warn "Auto-restore failed ($_). Falling back to manual config."
            Write-Info "Two options:"
            Write-Info "  (A) Open http://${Script:LPS8_DEFAULT_IP}:8000, go to System -> Backup/Flash"
            Write-Info "      -> Restore archive -> upload this file:"
            Write-Info "        $backup"
            Write-Info ""
            Write-Info "  (B) OR configure manually:"
            & $manualSteps
            Pause-User 'Press Enter when the LPS8 is configured'
        }
    }

    # Verify uplinks are arriving by tailing the gateway-bridge logs.
    Write-Info "Checking ChirpStack receives stats (waiting up to 90s)..."
    Push-Location $Script:REPO_DIR
    try {
        $deadline = (Get-Date).AddSeconds(90)
        while ((Get-Date) -lt $deadline) {
            $logs = & docker compose logs --tail=20 chirpstack-gateway-bridge 2>$null
            if ($logs -match 'publishing event.*event=stats') {
                Write-Ok "LPS8 is publishing stats to ChirpStack"
                return $true
            }
            Start-Sleep -Seconds 4
        }
    } finally { Pop-Location }
    Write-Warn "No stats packets received yet. The LPS8 may still be booting."
    Write-Info "You can verify later in the ChirpStack UI: http://localhost:8080"
    return $true  # not a hard failure
}

function Step-ModbusVerify {
    param($State)
    Write-Action "PHYSICAL STEPS - perform these now:"
    Write-Info "  1. Power on the Waveshare 4-CH RS485 gateway (DC 12-24V)."
    Write-Info "  2. Connect Ethernet from its 'POE ETH' port to your switch / PC."
    Write-Info "  3. Wait ~30 seconds for it to boot."
    Pause-User 'Press Enter when the Waveshare is powered up'

    # If first time at default IP, prompt user to configure.
    $defaultIP = '192.168.1.254'
    $configured = Test-NetConnection -ComputerName $Script:MODBUS_IP -Port $Script:MODBUS_PORT -InformationLevel Quiet -WarningAction SilentlyContinue
    if ($configured) {
        Write-Ok "Waveshare already at ${Script:MODBUS_IP}:${Script:MODBUS_PORT} - Modbus port open"
    } else {
        Write-Action "Configure the Waveshare in its web UI:"
        Write-Info ""
        Write-Info "  1. Open http://$defaultIP in your browser (factory IP)"
        Write-Info "     First-time login: enter any password (it will be stored)"
        Write-Info ""
        Write-Info "  2. Under 'Network Settings' set:"
        Write-Info "       Device IP    = $Script:MODBUS_IP"
        Write-Info "       Device Port  = $Script:MODBUS_PORT"
        Write-Info "       IP mode      = Static"
        Write-Info ""
        Write-Info "  3. Under 'Serial Settings' (channel 1) set:"
        Write-Info "       Baud Rate = 9600"
        Write-Info "       Databits  = 8"
        Write-Info "       Parity    = None"
        Write-Info "       Stopbits  = 1"
        Write-Info ""
        Write-Info "  4. Under 'Multi-Host Settings' set:"
        Write-Info "       Protocol  = Modbus TCP to RTU"
        Write-Info ""
        Write-Info "  5. Click the green 'Submit' button at the bottom."
        Write-Info "     The Waveshare will reboot (~10 seconds)."
        Pause-User 'Press Enter when the Waveshare has rebooted'

        $deadline = (Get-Date).AddSeconds(30)
        while ((Get-Date) -lt $deadline) {
            if (Test-NetConnection -ComputerName $Script:MODBUS_IP -Port $Script:MODBUS_PORT -InformationLevel Quiet -WarningAction SilentlyContinue) {
                Write-Ok "Modbus reachable at ${Script:MODBUS_IP}:${Script:MODBUS_PORT}"
                $configured = $true
                break
            }
            Start-Sleep -Seconds 3
        }
    }
    if (-not $configured) {
        Write-Fail "Modbus gateway not reachable on ${Script:MODBUS_IP}:${Script:MODBUS_PORT}"
        return $false
    }

    # Verify reachability from inside the Node-RED container.
    Push-Location $Script:REPO_DIR
    try {
        $env:MSYS_NO_PATHCONV = '1'
        $r = & docker compose exec -T nodered sh -c "nc -zv -w 3 $Script:MODBUS_IP $Script:MODBUS_PORT 2>&1"
        if ($r -match 'open') {
            Write-Ok "Reachable from Node-RED container"
            return $true
        }
        Write-Warn "Reachability from container is unclear: $r"
        return $true
    } finally { Pop-Location }
}

function Step-Finalize {
    param($State)
    Clear-AutoResume

    Write-Host ""
    Write-Host "  +=======================================================+" -ForegroundColor Green
    Write-Host "  |                                                       |" -ForegroundColor Green
    Write-Host "  |                  Installation complete!              |" -ForegroundColor Green
    Write-Host "  |                                                       |" -ForegroundColor Green
    Write-Host "  +=======================================================+" -ForegroundColor Green
    Write-Host ""
    Write-Info "  Web UIs:"
    Write-Info "    Node-RED:   http://localhost:1880"
    Write-Info "    ChirpStack: http://localhost:8080  (login admin / admin first time)"
    Write-Info "    REST API:   http://localhost:8090"
    Write-Host ""
    Write-Info "  Useful commands (in $Script:REPO_DIR):"
    Write-Info "    docker compose ps          - service status"
    Write-Info "    docker compose logs -f X   - follow logs of service X"
    Write-Info "    docker compose down        - stop the stack (data persists)"
    Write-Info "    docker compose up -d       - start it again"
    Write-Host ""
    Write-Info "  Setup log: $Script:LOG_FILE"
    Write-Host ""

    if (Confirm-User 'Open the ChirpStack and Node-RED UIs in your browser?' 'Y') {
        Start-Process 'http://localhost:8080'
        Start-Process 'http://localhost:1880'
    }
    return $true
}

#endregion

#region ============================================================
#                          ORCHESTRATOR
#=================================================================

function Invoke-Step {
    param($State, $StepDef)
    $stepState = Get-StepState $State $StepDef.Id
    if ($stepState.status -eq 'done' -and -not $Force) {
        Write-Step $StepDef.Id $Script:STEPS.Count $StepDef.Title
        Write-Ok "Already completed - skipping"
        return $true
    }
    Write-Step $StepDef.Id $Script:STEPS.Count $StepDef.Title
    Set-StepStatus $State $StepDef.Id 'running'

    $fnName = "Step-" + ($StepDef.Name -split '_' | ForEach-Object { $_.Substring(0,1).ToUpper() + $_.Substring(1) }) -join ''
    # Convert e.g. wsl_features -> WslFeatures
    $parts = $StepDef.Name -split '_'
    $fnName = "Step-" + (($parts | ForEach-Object { $_.Substring(0,1).ToUpper() + $_.Substring(1) }) -join '')

    if (-not (Get-Command $fnName -ErrorAction SilentlyContinue)) {
        Write-Fail "Internal error: function $fnName not found"
        Set-StepStatus $State $StepDef.Id 'failed' "Function $fnName not implemented"
        return $false
    }

    $okResult = $false
    try {
        $okResult = & $fnName -State $State
    } catch {
        $errMsg = $_.Exception.Message
        Write-Fail "Step crashed: $errMsg"
        Set-StepStatus $State $StepDef.Id 'failed' $errMsg
        Invoke-AIAssist -StepName $StepDef.Name -ErrorContext $errMsg
        return $false
    }

    if ($okResult) {
        Set-StepStatus $State $StepDef.Id 'done'
        return $true
    } else {
        $err = (Get-StepState $State $StepDef.Id).last_error
        if (-not $err) { $err = 'verification failed' }
        Set-StepStatus $State $StepDef.Id 'failed' $err
        Invoke-AIAssist -StepName $StepDef.Name -ErrorContext $err
        return $false
    }
}

function Start-Installer {
    Write-Banner
    Write-Log "Installer started - version $Script:INSTALLER_VERSION, AIAssist=$AIAssist, Resume=$Resume, Force=$Force"

    if ($Force -or -not (Test-Path $Script:STATE_FILE)) {
        if ($Force -and (Test-Path $Script:STATE_FILE)) {
            Write-Warn "Force mode - discarding previous state."
            Remove-Item $Script:STATE_FILE -Force
        }
        $state = Initialize-State
        if (-not $Resume) {
            Write-Host "  Welcome. This installer will set up the Falcon Stack on this PC." -ForegroundColor Cyan
            Write-Host "  Total steps: $($Script:STEPS.Count). Estimated time: 30-45 minutes." -ForegroundColor Cyan
            Write-Host ""
            if (-not (Confirm-User 'Ready to begin?' 'Y')) {
                Write-Info "Aborted by user."
                exit 0
            }
        }
    } else {
        $state = Load-State
        if ($null -eq $state) {
            Write-Warn "Could not read state file. Starting fresh."
            $state = Initialize-State
        } else {
            Write-Info "Resuming from saved state."
            Write-Log "Resumed from state file."
        }
    }

    # -Resume N (N>=1): mark all steps with id < N as done so the orchestrator
    # skips them. Useful when an earlier step is irrecoverable from the script
    # but the user already fixed it manually.
    if ($Resume -ge 1) {
        Write-Info "Skip-ahead requested: marking steps 1..$($Resume - 1) as done, starting at step $Resume."
        $now = (Get-Date).ToString('o')
        foreach ($s in $state.steps) {
            if ($s.id -lt $Resume -and $s.status -ne 'done') {
                $s.status = 'done'
                if (-not $s.completed_at) { $s.completed_at = $now }
                Write-Log "Skip-ahead: step $($s.id) ($($s.name)) marked done."
            }
        }
        Save-State $state
    }

    # Self-elevate if needed.
    if (-not (Test-IsAdmin)) {
        $forwardArgs = @()
        if ($Resume) { $forwardArgs += '-Resume', $Resume }
        if ($AIAssist) { $forwardArgs += '-AIAssist' }
        if ($Force) { $forwardArgs += '-Force' }
        Invoke-SelfElevate -ArgsForward $forwardArgs
    }

    foreach ($stepDef in $Script:STEPS) {
        $ok = Invoke-Step -State $state -StepDef $stepDef
        if (-not $ok) {
            Write-Host ""
            Write-Fail "Step '$($stepDef.Name)' failed."
            Write-Info "Fix the issue, then re-run the installer to continue from this step."
            Write-Info "Log: $Script:LOG_FILE"
            exit 1
        }
    }

    Write-Log "Installer finished successfully."
}

# Entry point.
Start-Installer

#endregion
