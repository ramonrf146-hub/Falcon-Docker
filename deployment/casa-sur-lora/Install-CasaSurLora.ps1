param(
    [string]$ProjectPath = 'C:\Projects\Falcon-CasaSur',
    [string]$GatewayEui = '',
    [int]$UiPort = 8080,
    [int]$UdpPort = 1700,
    [string]$SurNetwork = 'falcon-casa-sur_default',
    [switch]$SkipBootstrap,
    [switch]$SkipFirewall
)
$ErrorActionPreference = 'Stop'

function Fail([string]$Message) { throw $Message }

function Docker([string[]]$Arguments) {
    & docker.exe @Arguments
    if ($LASTEXITCODE -ne 0) { Fail ('docker ' + ($Arguments -join ' ') + ' fallo (codigo ' + $LASTEXITCODE + ').') }
}

# Ejecuta docker descartando toda la salida. En Windows PowerShell 5.1 redirigir el
# stderr de un ejecutable nativo con ErrorActionPreference=Stop lanza excepcion aunque
# el comando tenga exito, por eso se baja a Continue solo dentro de esta funcion.
function Docker-Quiet([string[]]$Arguments) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & docker.exe @Arguments *> $null; return $LASTEXITCODE }
    finally { $ErrorActionPreference = $previous }
}

function Write-Lf([string]$Path, [string]$Text) {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($Path, $Text.Replace("`r`n", "`n"), $utf8)
}

function New-Secret {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLower()
}

# --- Comprobaciones previas (no cambian nada) --------------------------------
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Fail 'Ejecuta este instalador en PowerShell como administrador.'
}
if (-not (Test-Path -LiteralPath $ProjectPath -PathType Container)) { Fail "No existe $ProjectPath." }
foreach ($required in @('lora.compose.yaml', 'config\chirpstack.toml', 'config\region_us915_1.toml',
        'config\chirpstack-gateway-bridge.toml', 'config\mosquitto.conf', 'config\001-init-extensions.sh',
        'bootstrap\bootstrap-chirpstack.sh', 'bootstrap\device-profiles.csv', 'bootstrap\devices.csv')) {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $required))) {
        Fail "Falta $required junto al instalador. Extrae el ZIP completo."
    }
}
if ($GatewayEui) {
    $GatewayEui = $GatewayEui.Trim().ToLower()
    if ($GatewayEui -notmatch '^[0-9a-f]{16}$') { Fail '-GatewayEui debe tener 16 caracteres hexadecimales (EUI del gateway).' }
}
if ((Docker-Quiet @('info')) -ne 0) { Fail 'Docker no responde. Abre Docker Desktop y espera a que este listo.' }
if ((Docker-Quiet @('network', 'inspect', $SurNetwork)) -ne 0) {
    Fail "No existe la red $SurNetwork. Inicia primero Casa Sur (docker compose up -d en $ProjectPath)."
}

$loraDir = Join-Path $ProjectPath 'lora'
$envFile = Join-Path $loraDir '.env.lora'
$firstInstall = -not (Test-Path -LiteralPath $envFile)

# El puerto solo se comprueba en una instalacion nueva: en una reinstalacion es el propio ChirpStack.
if ($firstInstall) {
    if (Get-NetTCPConnection -State Listen -LocalPort $UiPort -ErrorAction SilentlyContinue) {
        Fail "El puerto TCP $UiPort ya esta en uso. Usa -UiPort con otro numero."
    }
    if (Get-NetUDPEndpoint -LocalPort $UdpPort -ErrorAction SilentlyContinue) {
        Fail "El puerto UDP $UdpPort ya esta en uso. Usa -UdpPort con otro numero (y el mismo en el gateway LoRa)."
    }
}

# --- Copiar archivos ---------------------------------------------------------
Write-Host "Copiando archivos a $loraDir"
foreach ($sub in @('config', 'bootstrap', 'bootstrap\decoders')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $loraDir $sub) | Out-Null
}
$textFiles = @('lora.compose.yaml', 'config\chirpstack.toml', 'config\region_us915_1.toml',
    'config\chirpstack-gateway-bridge.toml', 'config\mosquitto.conf', 'config\001-init-extensions.sh',
    'bootstrap\bootstrap-chirpstack.sh', 'bootstrap\device-profiles.csv')
foreach ($file in $textFiles) {
    Write-Lf (Join-Path $loraDir $file) ([IO.File]::ReadAllText((Join-Path $PSScriptRoot $file)))
}
# devices.csv puede contener sensores ya registrados: no se sobrescribe si existe.
$devicesTarget = Join-Path $loraDir 'bootstrap\devices.csv'
if (-not (Test-Path -LiteralPath $devicesTarget)) {
    Write-Lf $devicesTarget ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'bootstrap\devices.csv')))
}
Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'bootstrap\decoders') -Filter *.js | ForEach-Object {
    Write-Lf (Join-Path $loraDir ('bootstrap\decoders\' + $_.Name)) ([IO.File]::ReadAllText($_.FullName))
}

# --- Configuracion y secretos (se conservan en reinstalaciones) --------------
if ($firstInstall) {
    $lines = @(
        'POSTGRES_USER=chirpstack',
        'POSTGRES_DB=chirpstack',
        ('POSTGRES_PASSWORD=' + (New-Secret)),
        ('CHIRPSTACK_API_SECRET=' + (New-Secret)),
        'CHIRPSTACK_REGION=us915_1',
        ('LPS8_GATEWAY_EUI=' + $GatewayEui),
        'LPS8_GATEWAY_NAME=LPS8-sur',
        ('LORA_UI_PORT=' + $UiPort),
        ('LORA_UDP_PORT=' + $UdpPort),
        ('SUR_NETWORK=' + $SurNetwork)
    )
    Write-Lf $envFile (($lines -join "`n") + "`n")
    Write-Host 'Creado .env.lora con secretos nuevos (no se muestran).'
} else {
    Write-Host 'Se conserva .env.lora existente (los secretos no cambian).'
    if ($GatewayEui) {
        $current = [IO.File]::ReadAllText($envFile)
        $updated = [regex]::Replace($current, '(?m)^LPS8_GATEWAY_EUI=.*$', ('LPS8_GATEWAY_EUI=' + $GatewayEui))
        Write-Lf $envFile $updated
    }
}

# --- Arranque ----------------------------------------------------------------
Set-Location -LiteralPath $loraDir
$compose = @('compose', '--env-file', '.env.lora', '-f', 'lora.compose.yaml')
Docker ($compose + @('config', '--quiet'))
Docker ($compose + @('up', '-d'))

Write-Host 'Esperando a ChirpStack (hasta 3 minutos)...'
$uiPortValue = $UiPort
$udpPortValue = $UdpPort
$envText = [IO.File]::ReadAllText($envFile)
if ($envText -match '(?m)^LORA_UI_PORT=(\d+)') { $uiPortValue = [int]$Matches[1] }
if ($envText -match '(?m)^LORA_UDP_PORT=(\d+)') { $udpPortValue = [int]$Matches[1] }
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$uiPortValue/" -TimeoutSec 3
        if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    Docker ($compose + @('logs', '--tail', '40', 'chirpstack'))
    Fail 'ChirpStack no respondio a tiempo. Los servicios siguen creados; revisa los registros anteriores.'
}

# --- Alta inicial: perfiles Dragino, aplicacion y gateway -------------------
if (-not $SkipBootstrap) {
    Write-Host 'Registrando perfiles Dragino y aplicacion...'
    Docker ($compose + @('--profile', 'init', 'run', '--rm', 'chirpstack-init'))
    $null = Docker-Quiet ($compose + @('--profile', 'init', 'stop', 'chirpstack-rest-api'))
    $null = Docker-Quiet ($compose + @('--profile', 'init', 'rm', '-f', 'chirpstack-rest-api', 'chirpstack-init'))
}

# --- Firewall: solo el gateway LoRa de la red local -------------------------
if (-not $SkipFirewall) {
    $ruleName = 'Falcon LoRa gateway UDP'
    if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol UDP -LocalPort $udpPortValue `
            -RemoteAddress LocalSubnet -Action Allow -Profile Any | Out-Null
        Write-Host "Regla de firewall creada: UDP $udpPortValue solo desde la red local."
    }
}

# --- Comprobacion: Node-RED debe resolver el broker con el nombre "mosquitto" -
$noderedId = (& docker.exe ps -q --filter 'label=com.docker.compose.project=falcon-casa-sur' --filter 'label=com.docker.compose.service=nodered' | Select-Object -First 1)
if ($noderedId) {
    & docker.exe exec $noderedId node -e "require('dns').lookup('mosquitto',function(e,a){process.exit(e?1:0)})"
    if ($LASTEXITCODE -eq 0) { Write-Host 'Node-RED de Casa Sur alcanza el broker MQTT "mosquitto".' }
    else { Write-Host 'AVISO: Node-RED no resuelve "mosquitto". Los sensores no llegaran al Dashboard hasta corregirlo.' }
} else {
    Write-Host 'AVISO: no se encontro el contenedor nodered de Casa Sur en ejecucion; no se pudo comprobar el broker.'
}

$lan = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
    ForEach-Object { $_.IPAddress })
Write-Host ''
Write-Host 'LORA INSTALADO.'
Write-Host "Interfaz ChirpStack (solo en esta PC): http://localhost:$uiPortValue  usuario admin, contrasena inicial admin: CAMBIALA ahora."
Write-Host ('IP(s) de esta PC para el gateway LoRa: ' + ($lan -join ', ') + "  puerto UDP $udpPortValue")
Write-Host 'Reserva esa IP en el router o fijala en Windows: si cambia, el gateway deja de llegar.'
