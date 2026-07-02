@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0.."
set "SERVER=root@155.212.245.24"
set "SSH_OPTS=-o ConnectTimeout=20 -o ConnectionAttempts=1 -o ServerAliveInterval=30 -o ServerAliveCountMax=20"
set "REMOTE_TMP=/tmp/kolob-contact-setup"
set "REMOTE_APP=/opt/kolob-contact"

if "%~1"=="" goto help_error
if /I "%~1"=="-h" goto help_ok
if /I "%~1"=="--help" goto help_ok

set "ADMIN_PASSWORD=%~1"

if not exist "%ROOT_DIR%\server\contact_server.py" (
  echo Missing server file: %ROOT_DIR%\server\contact_server.py
  exit /b 1
)

if not exist "%ROOT_DIR%\scripts\setup-colob-contact-server.remote.sh" (
  echo Missing remote setup script.
  exit /b 1
)

if not exist "%SystemRoot%\System32\OpenSSH\ssh.exe" (
  echo ssh.exe not found.
  exit /b 1
)

if not exist "%SystemRoot%\System32\tar.exe" (
  echo tar.exe not found.
  exit /b 1
)

for /f "usebackq delims=" %%A in (`node -e "process.stdout.write(Buffer.from(process.argv[1], 'utf8').toString('base64'))" "%ADMIN_PASSWORD%"`) do set "ADMIN_PASSWORD_B64=%%A"
if "%ADMIN_PASSWORD_B64%"=="" (
  echo Could not encode admin password.
  exit /b 1
)

echo Upload contact server files -^> %SERVER%
"%SystemRoot%\System32\tar.exe" -cf - -C "%ROOT_DIR%" server/contact_server.py scripts/setup-colob-contact-server.remote.sh | "%SystemRoot%\System32\OpenSSH\ssh.exe" %SSH_OPTS% %SERVER% "set -e; rm -rf '%REMOTE_TMP%'; mkdir -p '%REMOTE_TMP%' '%REMOTE_APP%'; tar -xf - -C '%REMOTE_TMP%'; cp '%REMOTE_TMP%/server/contact_server.py' '%REMOTE_APP%/contact_server.py'; CONTACT_ADMIN_PASSWORD_B64='%ADMIN_PASSWORD_B64%' sh '%REMOTE_TMP%/scripts/setup-colob-contact-server.remote.sh'"
if errorlevel 1 exit /b %ERRORLEVEL%

echo Done
exit /b 0

:help_ok
echo Usage: %~nx0 ADMIN_PASSWORD
echo.
echo Installs the lightweight Kolobochnaya contact-form backend on the server.
echo Routes:
echo   POST https://colob.spi.ski/api/contact
echo   GET  https://colob.spi.ski/leads
echo.
echo Leads are stored on the server in /srv/kolob-data/contacts.jsonl
exit /b 0

:help_error
call :help_ok
exit /b 1
