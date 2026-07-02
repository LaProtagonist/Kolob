@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
set "REMOTE_SCRIPT=%SCRIPT_DIR%activate-colob-caddy-route.remote.sh"

if "%SERVER%"=="" set "SERVER=root@155.212.245.24"
if "%SSH_OPTS%"=="" set "SSH_OPTS=-o ConnectTimeout=20 -o ConnectionAttempts=1 -o ServerAliveInterval=30 -o ServerAliveCountMax=20"

if not exist "%REMOTE_SCRIPT%" (
  echo Missing remote script: %REMOTE_SCRIPT%
  exit /b 1
)

if not exist "%SystemRoot%\System32\OpenSSH\ssh.exe" (
  echo ssh.exe not found.
  exit /b 1
)

echo Activate Caddy route colob.spi.ski on %SERVER%
type "%REMOTE_SCRIPT%" | "%SystemRoot%\System32\OpenSSH\ssh.exe" %SSH_OPTS% %SERVER% "bash -s"
exit /b %ERRORLEVEL%
