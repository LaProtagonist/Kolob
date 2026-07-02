@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
set "SERVER=root@155.212.245.24"
set "SSH_OPTS=-o ConnectTimeout=20 -o ConnectionAttempts=1 -o ServerAliveInterval=30 -o ServerAliveCountMax=20"
set "KOLOB_HOST=colob.spi.ski"
set "REMOTE_DIR=/srv/static/colob.spi.ski"
set "DO_BUILD=0"
set "DO_SYNC=0"

if "%~1"=="" goto help_error

:parse_args
if "%~1"=="" goto after_parse
if /I "%~1"=="-build" (
  set "DO_BUILD=1"
  shift
  goto parse_args
)
if /I "%~1"=="-sync" (
  set "DO_SYNC=1"
  shift
  goto parse_args
)
if /I "%~1"=="-deploy" (
  set "DO_BUILD=1"
  set "DO_SYNC=1"
  shift
  goto parse_args
)
if /I "%~1"=="-h" goto help_ok
if /I "%~1"=="--help" goto help_ok
echo Unknown option: %~1
goto help_error

:after_parse
if "%DO_BUILD%%DO_SYNC%"=="00" goto help_error

if not "%REMOTE_DIR%"=="/srv/static/colob.spi.ski" (
  echo Refusing to deploy to unexpected target: %REMOTE_DIR%
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

if "%DO_BUILD%"=="1" call :build_site || exit /b 1
if "%DO_SYNC%"=="1" call :sync_site || exit /b 1

echo Done
exit /b 0

:help_ok
echo Usage: %~nx0 -build ^| -sync ^| -deploy
echo.
echo   -build   build Kolobochnaya static site ^-^> dist
echo   -sync    upload existing dist ^-^> https://%KOLOB_HOST%
echo   -deploy  build and upload dist ^-^> https://%KOLOB_HOST%
echo.
echo This script only uploads Kolobochnaya static files.
echo It does not sync Caddy, docker, or the shared spi.ski project.
exit /b 0

:help_error
call :help_ok
exit /b 1

:build_site
echo Build Kolobochnaya ^-^> https://%KOLOB_HOST%
pushd "%ROOT_DIR%" || exit /b 1
call npm run build || (popd & exit /b 1)
popd

if not exist "%ROOT_DIR%dist\index.html" (
  echo Missing build output: %ROOT_DIR%dist\index.html
  exit /b 1
)
exit /b 0

:sync_site
if not exist "%ROOT_DIR%dist\index.html" (
  echo Missing build output: %ROOT_DIR%dist\index.html
  echo Run: %~nx0 -build
  exit /b 1
)

echo Sync static files ^-^> %REMOTE_DIR%
"%SystemRoot%\System32\tar.exe" --exclude="./__review" -cf - -C "%ROOT_DIR%dist" . | "%SystemRoot%\System32\OpenSSH\ssh.exe" %SSH_OPTS% %SERVER% "set -e; REMOTE_DIR='%REMOTE_DIR%'; case \"$REMOTE_DIR\" in /srv/static/colob.spi.ski) ;; *) echo \"Refusing to deploy to unexpected remote dir: $REMOTE_DIR\" >&2; exit 1 ;; esac; rm -rf \"$REMOTE_DIR\"; mkdir -p \"$REMOTE_DIR\"; tar -xf - -C \"$REMOTE_DIR\""
if errorlevel 1 exit /b %ERRORLEVEL%
echo Site synced ^-^> https://%KOLOB_HOST%
exit /b 0
