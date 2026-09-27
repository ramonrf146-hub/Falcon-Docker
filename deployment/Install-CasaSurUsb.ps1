param(
    [string]$ProjectPath = 'C:\Projects\Falcon-CasaSur',
    [string]$BusId = '2-2',
    [string]$DockerDesktopPath = '',
    [switch]$Run
)
$ErrorActionPreference = 'Stop'
$taskName = 'Falcon-CasaSur-USB'
$installDir = Join-Path $env:ProgramData 'Falcon-CasaSur-USB'

function Find-DockerDesktop([string]$ExplicitPath) {
    if ($ExplicitPath) {
        if (-not (Test-Path -LiteralPath $ExplicitPath -PathType Leaf) -or
            [IO.Path]::GetFileName($ExplicitPath) -ne 'Docker Desktop.exe') {
            throw '-DockerDesktopPath debe indicar el archivo Docker Desktop.exe existente.'
        }
        return (Resolve-Path -LiteralPath $ExplicitPath).Path
    }
    $candidates = @(
        Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue |
            ForEach-Object { $_.Path }
        foreach ($root in @($env:ProgramFiles, $env:ProgramW6432, $env:LOCALAPPDATA)) {
            if ($root) {
                Join-Path $root 'Docker\Docker\Docker Desktop.exe'
                Join-Path $root 'Docker\Docker\frontend\Docker Desktop.exe'
                Join-Path $root 'Docker\Docker Desktop.exe'
                Join-Path $root 'Docker\frontend\Docker Desktop.exe'
                Join-Path $root 'Programs\Docker\Docker\Docker Desktop.exe'
                Join-Path $root 'Programs\Docker\Docker\frontend\Docker Desktop.exe'
            }
        }
        foreach ($key in @(
            'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Docker Desktop',
            'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Docker Desktop',
            'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Docker Desktop'
        )) {
            $entry = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
            if ($entry.InstallLocation) { Join-Path $entry.InstallLocation 'Docker Desktop.exe' }
            if ($entry.InstallLocation) { Join-Path $entry.InstallLocation 'frontend\Docker Desktop.exe' }
        }
        # docker.exe commonly lives in <installation>\resources\bin.
        $cli = Get-Command docker.exe -ErrorAction SilentlyContinue
        if ($cli.Source) {
            $parent = Split-Path $cli.Source -Parent
            for ($i = 0; $i -lt 4 -and $parent; $i++) {
                Join-Path $parent 'Docker Desktop.exe'
                Join-Path $parent 'frontend\Docker Desktop.exe'
                $parent = Split-Path $parent -Parent
            }
        }
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    throw 'No se localizo Docker Desktop.exe. Abre Docker Desktop y repite; o indica -DockerDesktopPath con su ruta completa.'
}

if (-not $Run) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Ejecuta este instalador en PowerShell como administrador, con el usuario que utiliza Docker Desktop.'
    }
    $ProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
    foreach ($file in @('compose.yaml', 'EdgeLink.Dockerfile', 'edge-link.sh')) {
        if (-not (Test-Path -LiteralPath (Join-Path $ProjectPath $file))) { throw "Falta $file en $ProjectPath" }
    }
    if ($BusId -notmatch '^\d+-\d+(\.\d+)*$') { throw 'BUSID invalido.' }
    foreach ($cmd in @('docker.exe', 'usbipd.exe', 'wsl.exe')) { $null = Get-Command $cmd }
    $listing = (& usbipd.exe list 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0 -or $listing -notmatch ('(?m)^' + [regex]::Escape($BusId) + '\s+0403:6001\s+')) {
        throw "No se encontro el adaptador FTDI 0403:6001 en $BusId. Comprueba usbipd list."
    }
    $desktop = Find-DockerDesktop $DockerDesktopPath
    Write-Host "Docker Desktop detectado: $desktop"
    & usbipd.exe bind --busid $BusId
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo compartir el USB.' }
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existing) { Stop-ScheduledTask -TaskName $taskName }
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    # The elevated task must not execute a script writable by other local users.
    & icacls.exe $installDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo proteger la carpeta del instalador.' }
    $target = Join-Path $installDir 'Install-CasaSurUsb.ps1'
    if ($PSCommandPath -ne $target) { Copy-Item -LiteralPath $PSCommandPath -Destination $target -Force }
    $config = @{ ProjectPath=$ProjectPath; BusId=$BusId; Desktop=$desktop }
    $config | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $installDir 'config.json') -Encoding UTF8
    $action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$target`" -Run"
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $taskPrincipal -Settings $settings -Description 'Reconecta FTDI Casa Sur a WSL y Node-RED al iniciar sesion; supervisa cada 30 segundos.' -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
    Write-Host "Instalado. Se inicia ahora y al iniciar sesion con $($identity.Name)."
    Write-Host "Registro: $installDir\usb.log"
    Write-Host 'No opera antes del inicio de sesion; Docker Desktop requiere la sesion del usuario.'
    exit
}

$cfg = Get-Content -LiteralPath (Join-Path $installDir 'config.json') -Raw | ConvertFrom-Json
Set-Location -LiteralPath $cfg.ProjectPath
$logFile = Join-Path $installDir 'usb.log'
function Log([string]$message) {
    if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt 2MB) {
        Move-Item -LiteralPath $logFile -Destination "$logFile.1" -Force
    }
    Add-Content -LiteralPath $logFile -Value "$(Get-Date -Format s) $message"
}
function Native([string]$exe, [string[]]$arguments) {
    # Avoid NativeCommandError for informational stderr in Windows PowerShell 5.1.
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $output = & $exe @arguments 2>&1; $code = $LASTEXITCODE }
    finally { $ErrorActionPreference = $old }
    if ($code -ne 0) { throw "$exe fallo (codigo $code). $($output | Out-String)" }
    return ($output | Out-String).Trim()
}
$ready = $false
$signature = ''
$lastError = ''
$lastDesktopStart = [datetime]::MinValue
Log 'Supervisor iniciado. Esperando Docker Desktop y adaptador FTDI.'
while ($true) {
    try {
        if (-not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
            if (((Get-Date) - $lastDesktopStart).TotalMinutes -ge 2) {
                Start-Process -FilePath $cfg.Desktop -WindowStyle Hidden
                $lastDesktopStart = Get-Date
            }
        }
        $null = Native 'docker.exe' @('info','--format','{{.OSType}}')
        $null = Native 'wsl.exe' @('-d','docker-desktop','-u','root','--','modprobe','ftdi_sio')
        $listing = Native 'usbipd.exe' @('list')
        $row = @($listing -split '\r?\n' | Where-Object { $_ -match ('^' + [regex]::Escape($cfg.BusId) + '\s+0403:6001\s+') })
        if ($row.Count -ne 1) { throw 'FTDI no encontrado en el BUSID configurado. No se seleccionara otro adaptador.' }
        if ($row[0] -notmatch '\bAttached\s*$') {
            $ready = $false
            $null = Native 'usbipd.exe' @('attach','--wsl','--busid',$cfg.BusId)
            Start-Sleep -Seconds 3
        }
        # Verify hardware identity as well as the tty name before exposing it.
        $identityCheck = 'test -c /dev/ttyUSB0 || exit 1; p=$(readlink -f /sys/class/tty/ttyUSB0/device); while test "$p" != /; do if test -f "$p/idVendor"; then grep -qx 0403 "$p/idVendor" && grep -qx 6001 "$p/idProduct"; exit $?; fi; p=$(dirname "$p"); done; exit 1'
        # Windows PowerShell 5.1 strips embedded double quotes in native argv.
        # Transport the script as base64 so sh receives its quotes unchanged.
        $identityEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($identityCheck))
        $null = Native 'wsl.exe' @('-d','docker-desktop','--','sh','-c',"echo $identityEncoded | base64 -d | sh")
        $currentSignature = Native 'wsl.exe' @('-d','docker-desktop','--','stat','-c','%i:%t:%T','/dev/ttyUSB0')
        if ($signature -ne $currentSignature) { $ready = $false }
        if (-not $ready) {
            $gid = Native 'wsl.exe' @('-d','docker-desktop','--','stat','-c','%g','/dev/ttyUSB0')
            if ($gid -notmatch '^\d+$') { throw 'Grupo Linux invalido.' }
            $null = Native 'wsl.exe' @('-d','docker-desktop','-u','root','--','chmod','660','/dev/ttyUSB0')
            $override = Join-Path $cfg.ProjectPath 'compose.usb.yaml'
            if ((Test-Path $override) -and -not (Test-Path "$override.before-automation")) {
                Copy-Item -LiteralPath $override -Destination "$override.before-automation"
            }
            $json = @{services=@{nodered=@{devices=@('/dev/ttyUSB0:/dev/ttyUSB0');group_add=@("$gid")}}} | ConvertTo-Json -Depth 6
            [IO.File]::WriteAllText($override,$json,(New-Object Text.UTF8Encoding($false)))
            $compose = @('compose','-f','compose.yaml','-f','compose.usb.yaml')
            $null = Native 'docker.exe' ($compose + @('config','--quiet'))
            # Database and relay are started if needed; only Node-RED is forcibly recreated.
            $null = Native 'docker.exe' ($compose + @('up','-d','postgres'))
            $null = Native 'docker.exe' ($compose + @('up','-d','--no-deps','--force-recreate','nodered'))
            $null = Native 'docker.exe' ($compose + @('up','-d','--no-deps','edge-link'))
            $signature = $currentSignature
        }
        $null = Native 'docker.exe' @('compose','-f','compose.yaml','-f','compose.usb.yaml','exec','-T','nodered','sh','-c','test -c /dev/ttyUSB0 && test -r /dev/ttyUSB0 && test -w /dev/ttyUSB0')
        if (-not $ready) { Log 'USB_ACCESIBLE: FTDI conectado y Node-RED con lectura/escritura.' }
        $ready = $true
        $lastError = ''
    } catch {
        $ready = $false
        $message = $_.Exception.Message
        if ($message -ne $lastError) { Log "PENDIENTE: $message"; $lastError = $message }
    }
    Start-Sleep -Seconds 30
}
