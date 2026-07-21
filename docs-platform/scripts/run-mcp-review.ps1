[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$platformRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path

Set-Location -LiteralPath $platformRoot
$env:MCP_CAPABILITY_MODE = "review"
Remove-Item -Path Env:MCP_WRITE_ACK -ErrorAction SilentlyContinue

& npm --prefix (Join-Path $platformRoot "mcp") run dev
exit $LASTEXITCODE
