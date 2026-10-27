# FeedMeLean — One-Step Cloudflare Staging Setup & Deployment Script
$ErrorActionPreference = "Stop"

Write-Host "1. Checking Cloudflare authentication..." -ForegroundColor Cyan
try {
    npx wrangler whoami | Out-Null
} catch {
    Write-Host "Logging in to Cloudflare via browser..." -ForegroundColor Yellow
    npx wrangler login
}

Write-Host "2. Ensuring D1 Database 'feedmelean-staging-db' exists..." -ForegroundColor Cyan
$d1ListJson = npx wrangler d1 list --json | ConvertFrom-Json
$existingDb = $d1ListJson | Where-Object { $_.name -eq "feedmelean-staging-db" } | Select-Object -First 1

if (-not $existingDb) {
    Write-Host "Creating D1 database 'feedmelean-staging-db'..." -ForegroundColor Yellow
    npx wrangler d1 create feedmelean-staging-db | Out-Host
    $d1ListJson = npx wrangler d1 list --json | ConvertFrom-Json
    $existingDb = $d1ListJson | Where-Object { $_.name -eq "feedmelean-staging-db" } | Select-Object -First 1
}

$dbId = $existingDb.uuid
Write-Host "Using D1 Database ID: $dbId" -ForegroundColor Green

# Update wrangler.jsonc with the real D1 database_id
$wranglerPath = Join-Path $PSScriptRoot "wrangler.jsonc"
$wranglerContent = Get-Content $wranglerPath -Raw
$wranglerContent = $wranglerContent -replace '"database_id":\s*"00000000-0000-0000-0000-000000000000"', "`"database_id`": `"$dbId`""
Set-Content $wranglerPath $wranglerContent -NoNewline

Write-Host "3. Applying D1 schema migrations to remote staging database..." -ForegroundColor Cyan
npx wrangler d1 migrations apply feedmelean-staging-db --env staging --remote

Write-Host "4. Uploading secrets from .dev.vars to Cloudflare Staging..." -ForegroundColor Cyan
if (Test-Path ".dev.vars") {
    Get-Content ".dev.vars" | ForEach-Object {
        if ($_ -match "^(AI_API_KEY|RECAPTCHA_SECRET_KEY|AZURE_BLOB_CONNECTION_STRING)=(.+)$") {
            $key = $Matches[1]
            $val = $Matches[2].Trim()
            Write-Host "Setting secret $key..."
            $val | npx wrangler secret put $key --env staging
        }
    }
}

Write-Host "5. Building and deploying FeedMeLean to Cloudflare Staging..." -ForegroundColor Cyan
npm run deploy:staging

Write-Host "Deployment Complete!" -ForegroundColor Green

