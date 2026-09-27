#Requires -Version 5.1
<#
.SYNOPSIS
    Bootstrap de una sola vez para un sitio (Edge) nuevo de Falcon-Docker.

.DESCRIPTION
    Desde que los usuarios se centralizaron en el Hub (Etapa 5), un sitio
    con HUB_URL configurado en su .env YA NO necesita este script -- el
    login se valida en tiempo real contra el Hub, no hay tabla local de
    usuarios que provisionar. Si detecta HUB_URL, este script no hace
    nada mas que avisarte: crea el primer usuario directo en
    <HUB_URL>/hub/usuarios y asignale el area de este sitio ahi.

    Si el .env NO tiene HUB_URL (sitio standalone, sin Hub -- caso poco
    comun), el sitio sigue usando su propia tabla local riego_auth.users,
    y este script hace lo de siempre:

      1. Aplica postgres/riego-auth-users-schema.sql (crea el schema y la
         tabla riego_auth.users si todavia no existen -- initdb solo corre
         en un volumen de Postgres realmente nuevo, asi que esto cubre el
         caso real: "docker compose up" ya corrio una vez).
      2. Crea el primer usuario admin, si todavia no existe ninguno.
         No hay endpoint de "primer usuario" local: crear usuarios
         requiere estar logueado como admin, asi que el primero se
         inserta directo en la base.

.PARAMETER AdminUser
    Nombre de usuario del primer admin. Default: ramon.

.PARAMETER AdminPassword
    Password del primer admin. Si no se pasa, se pide en el momento (no
    queda en el historial de PowerShell).

.PARAMETER PostgresService
    Nombre del servicio de Postgres en docker-compose.yml. Default: postgres.

.PARAMETER NoderedService
    Nombre del servicio de Node-RED en docker-compose.yml. Default: nodered.

.EXAMPLE
    .\bootstrap-new-site.ps1

.EXAMPLE
    .\bootstrap-new-site.ps1 -AdminUser operador1
#>
[CmdletBinding()]
param(
    [string]$AdminUser = 'ramon',
    [string]$AdminPassword = '',
    [string]$PostgresService = 'postgres',
    [string]$NoderedService = 'nodered'
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Msg) {
    Write-Host "ERROR: $Msg" -ForegroundColor Red
    exit 1
}
function Ok([string]$Msg) { Write-Host "OK: $Msg" -ForegroundColor Green }
function Info([string]$Msg) { Write-Host $Msg -ForegroundColor Cyan }

if ($AdminUser -notmatch '^[A-Za-z0-9_-]{2,50}$') {
    Fail "Nombre de usuario invalido: '$AdminUser' (solo letras, numeros, guion y guion bajo, 2-50 caracteres)."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot '.env'
if (Test-Path $envFile) {
    $hubUrlLine = (Get-Content $envFile | Where-Object { $_ -match '^\s*HUB_URL\s*=\s*(.+)$' } | Select-Object -Last 1)
    if ($hubUrlLine -and ($hubUrlLine -replace '^\s*HUB_URL\s*=\s*', '').Trim()) {
        Write-Host ""
        Write-Host "Este sitio tiene HUB_URL configurado -- los usuarios se administran" -ForegroundColor Yellow
        Write-Host "desde el Hub central, no hace falta correr este script." -ForegroundColor Yellow
        Write-Host "Crea el usuario directo en <HUB_URL>/hub/usuarios y asignale esta area." -ForegroundColor Yellow
        exit 0
    }
}

$schemaFile = Join-Path $repoRoot 'postgres\riego-auth-users-schema.sql'
if (-not (Test-Path $schemaFile)) { Fail "No se encontro $schemaFile. ¿Corriste esto desde el repo clonado?" }

Push-Location $repoRoot
try {
    # 1. Verificar que el servicio de Postgres esta corriendo.
    $pgId = (docker compose ps -q $PostgresService)
    if (-not $pgId) { Fail "El servicio '$PostgresService' no esta corriendo. Corre 'docker compose up -d' primero." }
    Ok "Servicio '$PostgresService' corriendo."

    # 2. Aplicar el schema de usuarios (idempotente: CREATE ... IF NOT EXISTS).
    Info "Aplicando $schemaFile ..."
    Get-Content $schemaFile -Raw | docker compose exec -T $PostgresService psql -v ON_ERROR_STOP=1 -U chirpstack -d chirpstack
    if ($LASTEXITCODE -ne 0) { Fail "No se pudo aplicar el schema de usuarios." }
    Ok "Schema de riego_auth.users listo."

    # 3. No pisar usuarios existentes -- si ya hay alguno, avisar y salir.
    $existingRaw = docker compose exec -T $PostgresService psql -tAc "SELECT count(*) FROM riego_auth.users;" -U chirpstack -d chirpstack
    $existing = 0
    [void][int]::TryParse(($existingRaw -join '').Trim(), [ref]$existing)
    if ($existing -gt 0) {
        Write-Host ""
        Write-Host "Ya existen $existing usuario(s) en riego_auth.users -- no se crea ninguno nuevo." -ForegroundColor Yellow
        Write-Host "Si necesitas otra cuenta, entra al dashboard como admin y usa 'Gestionar usuarios'." -ForegroundColor Yellow
        return
    }

    # 4. Pedir password si no vino por parametro (no queda en el historial).
    if (-not $AdminPassword) {
        $sec = Read-Host "Password para el primer usuario admin ('$AdminUser')" -AsSecureString
        $AdminPassword = [System.Net.NetworkCredential]::new('', $sec).Password
    }
    if ($AdminPassword.Length -lt 8) { Fail "La password debe tener al menos 8 caracteres." }

    # 5. Generar el hash bcrypt dentro del contenedor de Node-RED (ya trae
    #    bcryptjs instalado). Se pasa por variable de entorno del proceso,
    #    no interpolada en el codigo, para no depender de escaping de shell.
    Info "Generando hash de la password..."
    $hash = (docker compose exec -T -e BOOTSTRAP_PW=$AdminPassword $NoderedService node -e "console.log(require('bcryptjs').hashSync(process.env.BOOTSTRAP_PW, 10))").Trim()
    $AdminPassword = $null
    if (-not $hash.StartsWith('$2')) { Fail "No se pudo generar el hash bcrypt (¿el servicio '$NoderedService' esta corriendo?)." }

    # 6. Insertar el primer usuario admin.
    $insertSql = "INSERT INTO riego_auth.users (username, password_hash, role, must_change_password) VALUES ('$AdminUser', '$hash', 'admin', false);"
    $insertSql | docker compose exec -T $PostgresService psql -v ON_ERROR_STOP=1 -U chirpstack -d chirpstack
    if ($LASTEXITCODE -ne 0) { Fail "No se pudo crear el usuario admin." }

    Write-Host ""
    Ok "Usuario admin '$AdminUser' creado. Ya podes loguearte en el dashboard (http://localhost:1880)."
} finally {
    Pop-Location
}
