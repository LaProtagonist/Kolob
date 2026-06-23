@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
set "SPISKI_DIR=%ROOT_DIR%..\spi.ski"
set "SERVER=root@155.212.245.24"
set "SSH_OPTS=-o ConnectTimeout=10 -o ConnectionAttempts=1 -o ServerAliveInterval=30 -o ServerAliveCountMax=20"
set "REMOTE_DIR=/srv/static/colob.spi.ski"
set "CADDY_REMOTE_DIR=/opt/server.host"
set "DO_DEPLOY=0"
set "DO_CADDY=0"

if "%~1"=="" goto help_error

:parse_args
if "%~1"=="" goto after_parse
if /I "%~1"=="-deploy" (
  set "DO_DEPLOY=1"
  shift
  goto parse_args
)
if /I "%~1"=="-caddy" (
  set "DO_CADDY=1"
  shift
  goto parse_args
)
if /I "%~1"=="-all" (
  set "DO_DEPLOY=1"
  set "DO_CADDY=1"
  shift
  goto parse_args
)
if /I "%~1"=="-h" goto help_ok
if /I "%~1"=="--help" goto help_ok
echo Unknown option: %~1
goto help_error

:after_parse
if "%DO_DEPLOY%%DO_CADDY%"=="00" goto help_error

if not exist "%SystemRoot%\System32\OpenSSH\ssh.exe" (
  echo ssh.exe not found.
  exit /b 1
)

if not exist "%SystemRoot%\System32\tar.exe" (
  echo tar.exe not found.
  exit /b 1
)

if "%DO_DEPLOY%"=="1" call :deploy_site || exit /b 1
if "%DO_CADDY%"=="1" call :sync_caddy || exit /b 1

echo Done
exit /b 0

:help_ok
echo Usage: %~nx0 -deploy ^| -caddy ^| -all
echo.
echo   -deploy  build and sync only Kolobochnaya static files ^-^> https://colob.spi.ski
echo   -caddy   upload only server.host/Caddyfile and reload Caddy
echo   -all     deploy static files and apply the Caddy route
exit /b 0

:help_error
call :help_ok
exit /b 1

:deploy_site
echo Build colob ^-^> https://colob.spi.ski
pushd "%ROOT_DIR%" || exit /b 1
call npm run build || (popd & exit /b 1)
popd

if not exist "%ROOT_DIR%dist\index.html" (
  echo Missing build output: %ROOT_DIR%dist\index.html
  exit /b 1
)

echo Sync static files ^-^> %REMOTE_DIR%
"%SystemRoot%\System32\tar.exe" -cf - -C "%ROOT_DIR%dist" . | "%SystemRoot%\System32\OpenSSH\ssh.exe" %SSH_OPTS% %SERVER% "rm -rf '%REMOTE_DIR%' && mkdir -p '%REMOTE_DIR%' && tar -xf - -C '%REMOTE_DIR%'"
exit /b %ERRORLEVEL%

:sync_caddy
echo Sync Caddyfile route ^-^> https://colob.spi.ski
"%SystemRoot%\System32\tar.exe" -cf - -C "%SPISKI_DIR%\server.host" Caddyfile | "%SystemRoot%\System32\OpenSSH\ssh.exe" %SSH_OPTS% %SERVER% "mkdir -p '%CADDY_REMOTE_DIR%' && tar -xf - -C '%CADDY_REMOTE_DIR%' && (docker exec land-static-caddy caddy reload --config /etc/caddy/Caddyfile || docker restart land-static-caddy)"
exit /b %ERRORLEVEL%
