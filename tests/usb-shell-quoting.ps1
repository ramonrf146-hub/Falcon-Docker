# Read-only with respect to hardware; synthetic sysfs fixtures in WSL /tmp.
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$source = Join-Path $PSScriptRoot '..\deployment\Install-CasaSurUsb.ps1'
$ast = [Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
$native = $ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Native'},$true)
Invoke-Expression $native.Extent.Text
$assignment = $ast.Find({param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$identityCheck'},$true)
Invoke-Expression $assignment.Extent.Text
$check = $identityCheck.Replace('/dev/ttyUSB0','/dev/null').Replace('/sys/class/tty/ttyUSB0/device','$fixture/device/interface/port')
foreach ($vendor in @('0403','9999')) {
    $setup = 'fixture=$(mktemp -d); trap ''rm -rf "$fixture"'' EXIT; mkdir -p "$fixture/device/interface/port"; echo VENDOR > "$fixture/device/idVendor"; echo 6001 > "$fixture/device/idProduct"; '
    $script = $setup.Replace('VENDOR',$vendor) + $check
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))
    $failed = $false
    try { $null = Native 'wsl.exe' @('-d','docker-desktop','--','sh','-c',"echo $encoded | base64 -d | sh") } catch { $failed = $true }
    if (($vendor -eq '0403' -and $failed) -or ($vendor -eq '9999' -and -not $failed)) { throw "Identity test failed for $vendor" }
}
Write-Output "PASS: PowerShell $($PSVersionTable.PSVersion), WSL shell quotes, matching FTDI accepted, other vendor rejected."
