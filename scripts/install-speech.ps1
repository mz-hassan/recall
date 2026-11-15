$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path .local/speech-venv/Scripts/python.exe)) { python -m venv .local/speech-venv }
& .local/speech-venv/Scripts/python.exe -m pip install -r scripts/speech-requirements.txt
if ($LASTEXITCODE) { throw 'Speech dependencies failed to install.' }
& .local/speech-venv/Scripts/python.exe scripts/download-speech.py
if ($LASTEXITCODE) { throw 'Speech model failed to download.' }
