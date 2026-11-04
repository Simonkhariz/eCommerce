# Package Shop.co on this PC and upload it to the Oracle server (deploy/oracle/README.md).
#
#   First time, with your shop's database (products, settings, admin accounts):
#     powershell -ExecutionPolicy Bypass -File deploy\oracle\upload.ps1 -Ip 129.151.10.20 -WithDatabase
#   Later updates (code only; the server's database is kept):
#     powershell -ExecutionPolicy Bypass -File deploy\oracle\upload.ps1 -Ip 129.151.10.20
#
# Only committed code is uploaded (git archive of the current branch): settings files, logs,
# backups and node_modules never leave this PC. Prints the command to run on the server.
param(
    [Parameter(Mandatory = $true)][string]$Ip,
    [string]$Key = "$HOME\.ssh\oracle_shopco",
    [string]$User = 'ubuntu',
    [switch]$WithDatabase
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repo

if ($Ip -notmatch '^\d+\.\d+\.\d+\.\d+$') { throw "-Ip must be the server's public IP address, e.g. 129.151.10.20" }
if (-not (Test-Path $Key)) { throw "SSH key not found: $Key (README step 2 makes it)" }
$target = "$User@$Ip"
$sshArgs = @('-i', $Key, '-o', 'StrictHostKeyChecking=accept-new')

$changes = git status --porcelain --untracked-files=no
if ($changes) {
    Write-Warning 'You have changes that are not committed. Only committed code is uploaded.'
}
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$commit = (git rev-parse --short HEAD).Trim()

$work = Join-Path $env:TEMP 'shopco-upload'
New-Item -ItemType Directory -Force $work | Out-Null
$archive = Join-Path $work 'shopco.tar.gz'
Write-Host "==> Packaging $branch ($commit)"
# Linux line endings whatever this PC's Git setting: with core.autocrlf=true (the Windows default)
# a plain git archive writes CRLF, and the server's scripts would not run.
git -c core.autocrlf=false -c core.eol=lf archive --format=tar.gz -o $archive HEAD
if ($LASTEXITCODE -ne 0) { throw 'git archive failed' }

Write-Host "==> Uploading the code to $Ip"
scp @sshArgs $archive "${target}:~/shopco.tar.gz"
if ($LASTEXITCODE -ne 0) { throw 'Upload failed: is the server running, port 22 open and the key right?' }
ssh @sshArgs $target 'rm -rf ~/shopco-setup && mkdir -p ~/shopco-setup && tar -xzf ~/shopco.tar.gz -C ~/shopco-setup deploy/oracle'
if ($LASTEXITCODE -ne 0) { throw 'Could not unpack the setup files on the server' }

$backupArg = ''
if ($WithDatabase) {
    Write-Host '==> Backing up this PC''s shop database'
    php backend/scripts/backup.php
    if ($LASTEXITCODE -ne 0) { throw 'The backup failed (is MySQL running in XAMPP?)' }
    $folder = Get-ChildItem 'backend\storage\backups' -Directory |
        Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{6}$' -and (Test-Path (Join-Path $_.FullName 'manifest.json')) } |
        Sort-Object Name | Select-Object -Last 1
    Write-Host "==> Uploading the database backup $($folder.Name)"
    ssh @sshArgs $target 'mkdir -p ~/shopco-backup'
    scp @sshArgs -r $folder.FullName "${target}:~/shopco-backup/"
    if ($LASTEXITCODE -ne 0) { throw 'Uploading the backup failed' }
    $backupArg = " ~/shopco-backup/$($folder.Name)"
}

Write-Host ''
Write-Host 'Uploaded. Now run ONE of these:'
Write-Host '  First time (sets up the whole server, about 15 minutes):'
Write-Host "    ssh -t -i `"$Key`" $target `"sudo bash ~/shopco-setup/deploy/oracle/setup.sh $Ip ~/shopco.tar.gz$backupArg`""
Write-Host '  Update (server already set up):'
Write-Host "    ssh -t -i `"$Key`" $target `"sudo bash ~/shopco-setup/deploy/oracle/deploy.sh ~/shopco.tar.gz`""
