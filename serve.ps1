# Serve app for local dev
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
python -m http.server 8080
