# Registers or removes the "ThreadsStudio" scheduled task (run at boot, no login needed).
# Called by 자동실행등록.bat / 자동실행해제.bat with admin rights. Keep this file ASCII:
# Windows PowerShell 5.1 reads BOM-less scripts as ANSI, so Korean paths come in as arguments.
param(
  [string]$Runner,
  [string]$User,
  [switch]$Remove
)
$ErrorActionPreference = 'Stop'
$name = 'ThreadsStudio'

if ($Remove) {
  if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
    Write-Host "OK: task '$name' removed."
  } else {
    Write-Host "Task '$name' was not registered."
  }
  exit 0
}

if (-not $Runner -or -not (Test-Path -LiteralPath $Runner)) { throw "Runner not found: $Runner" }
if (-not $User) { $User = "$env:USERDOMAIN\$env:USERNAME" }
$dir = Split-Path -Parent $Runner

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"`"$Runner`"`"" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT1M'  # give the network a minute after boot
# S4U: runs whether or not the user is logged on, without storing the password.
$principal = New-ScheduledTaskPrincipal -UserId $User -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $name
Write-Host "OK: task '$name' registered for $User and started."
