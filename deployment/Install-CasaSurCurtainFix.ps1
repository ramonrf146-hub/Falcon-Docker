param([string]$ProjectPath='C:\Projects\Falcon-CasaSur')
$ErrorActionPreference='Stop'
function Docker([string[]]$Arguments){
    & docker.exe @Arguments
    if($LASTEXITCODE -ne 0){throw 'Docker devolvio un error. Casa Sur debe permanecer en Manual; no reactives rutinas hasta completar la instalacion.'}
}
Set-Location -LiteralPath $ProjectPath
$compose=@('compose','-f','compose.yaml','-f','compose.usb.yaml')
foreach($name in @('patch-curtain-recovery.cjs','curtain-recovery-patch.json')){
    if(-not(Test-Path (Join-Path $PSScriptRoot $name))){throw "Falta $name junto al instalador."}
    Docker ($compose+@('cp',(Join-Path $PSScriptRoot $name),"nodered:/data/$name"))
}
# Checks are read-only, while the current service is still running.
Docker ($compose+@('exec','-T','nodered','node','/data/patch-curtain-recovery.cjs','/data','/nonexistent','--check'))
$task=Get-ScheduledTask -TaskName 'Falcon-CasaSur-USB' -ErrorAction SilentlyContinue
if($task){Stop-ScheduledTask -TaskName 'Falcon-CasaSur-USB';Start-Sleep -Seconds 3}
Docker ($compose+@('stop','nodered'))
# The service is stopped, so it cannot overwrite the patched flows on disk.
$sourcePath=Join-Path $ProjectPath 'nodered\riego-flow-backup'
if(-not(Test-Path -LiteralPath $sourcePath -PathType Container)){throw "Falta $sourcePath. Node-RED permanece detenido."}
Docker ($compose+@('run','--rm','--no-deps','-T','--volume',"${sourcePath}:/source",'--entrypoint','node','nodered','/data/patch-curtain-recovery.cjs','/data','/source'))
Docker ($compose+@('up','-d','--no-deps','nodered'))
Docker ($compose+@('exec','-T','nodered','node','/data/patch-curtain-recovery.cjs','/data','/nonexistent','--check'))
if($task){Start-ScheduledTask -TaskName 'Falcon-CasaSur-USB'}
Write-Host 'CORRECCION INSTALADA. Configuracion y rutinas conservadas. Casa Sur permanece en Manual.'
Write-Host 'Antes de activar Automatico, programa una prueba futura corta y confirma un pulso al abrir y otro al cerrar.'
