[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$platformRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$localConfigPath = Join-Path $platformRoot ".secrets\tunnel.json"
$reviewServerLauncher = Join-Path $PSScriptRoot "run-mcp-review.ps1"
$expectedProfile = "kolobochnaya-review"

if (-not (Test-Path -LiteralPath $localConfigPath)) {
  throw "Missing local tunnel configuration: $localConfigPath. Copy config\\tunnel.example.json to .secrets\\tunnel.json and add only the tunnelId."
}

try {
  $localConfig = Get-Content -LiteralPath $localConfigPath -Raw | ConvertFrom-Json
} catch {
  throw "Local tunnel configuration is not valid JSON: $localConfigPath"
}

$tunnelId = [string]$localConfig.tunnelId
$profile = if ([string]::IsNullOrWhiteSpace([string]$localConfig.profile)) { $expectedProfile } else { [string]$localConfig.profile }
if ([string]::IsNullOrWhiteSpace($tunnelId)) {
  throw "Local tunnel configuration has no tunnelId. Create the tunnel in OpenAI Platform Tunnel Settings first."
}
if ($profile -ne $expectedProfile) {
  throw "Only the review profile '$expectedProfile' is allowed by this launcher."
}

$tunnelClient = Get-Command tunnel-client -CommandType Application -ErrorAction SilentlyContinue
if ($null -eq $tunnelClient) {
  throw "tunnel-client was not found in PATH. Download it only from OpenAI Platform Tunnel Settings or the latest release of openai/tunnel-client, then retry."
}

Write-Host "Starting review-only tunnel profile '$expectedProfile'."
Write-Host "The MCP child process will use: MCP_CAPABILITY_MODE=review"
Write-Host "Running tunnel-client help quickstart before profile initialization."
& $tunnelClient.Source help quickstart
if ($LASTEXITCODE -ne 0) { throw "tunnel-client help quickstart failed with exit code $LASTEXITCODE." }

$runtimeKey = Read-Host -Prompt "OpenAI runtime API key (input hidden)" -AsSecureString
$runtimeKeyBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($runtimeKey)
$runtimeApiKey = $null
$hadControlPlaneKey = Test-Path Env:CONTROL_PLANE_API_KEY
$previousControlPlaneKey = $env:CONTROL_PLANE_API_KEY
$hadCapabilityMode = Test-Path Env:MCP_CAPABILITY_MODE
$previousCapabilityMode = $env:MCP_CAPABILITY_MODE
$hadWriteAck = Test-Path Env:MCP_WRITE_ACK
$previousWriteAck = $env:MCP_WRITE_ACK

try {
  $runtimeApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($runtimeKeyBstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($runtimeKeyBstr)
}

if ([string]::IsNullOrWhiteSpace($runtimeApiKey)) {
  throw "A runtime API key is required. The key was not saved."
}

try {
  $env:CONTROL_PLANE_API_KEY = $runtimeApiKey
  $env:MCP_CAPABILITY_MODE = "review"
  Remove-Item -Path Env:MCP_WRITE_ACK -ErrorAction SilentlyContinue
  Set-Location -LiteralPath $platformRoot

  # The profile has an explicit review-only command. The helper sets its own
  # working directory and clears any inherited write acknowledgement.
  $mcpCommand = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$reviewServerLauncher`""
  & $tunnelClient.Source init --sample sample_mcp_stdio_local --profile $expectedProfile --tunnel-id $tunnelId --mcp-command $mcpCommand
  if ($LASTEXITCODE -ne 0) { throw "tunnel-client init failed with exit code $LASTEXITCODE." }

  & $tunnelClient.Source doctor --profile $expectedProfile --explain
  if ($LASTEXITCODE -ne 0) { throw "tunnel-client doctor failed with exit code $LASTEXITCODE. The tunnel was not started." }

  Write-Host "Doctor passed. Running the review-only tunnel; stop it with Ctrl+C."
  & $tunnelClient.Source run --profile $expectedProfile
  if ($LASTEXITCODE -ne 0) { throw "tunnel-client run exited with code $LASTEXITCODE." }
} finally {
  $runtimeApiKey = $null
  if ($hadControlPlaneKey) { $env:CONTROL_PLANE_API_KEY = $previousControlPlaneKey } else { Remove-Item -Path Env:CONTROL_PLANE_API_KEY -ErrorAction SilentlyContinue }
  if ($hadCapabilityMode) { $env:MCP_CAPABILITY_MODE = $previousCapabilityMode } else { Remove-Item -Path Env:MCP_CAPABILITY_MODE -ErrorAction SilentlyContinue }
  if ($hadWriteAck) { $env:MCP_WRITE_ACK = $previousWriteAck } else { Remove-Item -Path Env:MCP_WRITE_ACK -ErrorAction SilentlyContinue }
}
