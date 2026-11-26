$ErrorActionPreference = "Stop"
$scriptPath = Join-Path $PSScriptRoot "install.mjs"
& node $scriptPath @args
exit $LASTEXITCODE
