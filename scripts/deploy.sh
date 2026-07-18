#!/usr/bin/env bash
# One-shot "keep backend + frontend in sync" deploy.
#
#   NETLIFY_AUTH_TOKEN=<token> bash scripts/deploy.sh
#
# Order matters: push DB migrations FIRST so the remote schema already has any
# new columns/tables before the new frontend (which reads/writes them) goes
# live. Then build the web bundle in SUPABASE mode (never mock, never
# ALLOW_ANY_EMAIL — deploys are .edu-only), patch the HTML, and deploy to the
# stable `hereby-app` Netlify site.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${NETLIFY_AUTH_TOKEN:?set NETLIFY_AUTH_TOKEN (Netlify personal access token) inline; never commit it}"

# 1. BACKEND — apply any pending migrations to the remote Supabase DB. No-op if
#    everything is already applied.
echo "==> Pushing Supabase migrations..."
printf 'y\n' | npx supabase db push

# 2. FRONTEND — build in supabase mode. `.env.local` (mock + ALLOW_ANY_EMAIL)
#    takes precedence locally, so move it aside for the export and always
#    restore it, even on failure.
moved=0
if [ -f .env.local ]; then mv .env.local .env.local.bak; moved=1; fi
trap '[ "$moved" = 1 ] && mv -f .env.local.bak .env.local' EXIT

echo "==> Building web (supabase mode)..."
rm -rf dist .expo/cache node_modules/.cache/metro
npx expo export -p web --clear
node scripts/postexport.js

# 3. DEPLOY — prod, to the linked hereby-app site.
echo "==> Deploying to Netlify (hereby-app, prod)..."
npx netlify-cli deploy --dir=dist --prod

echo "==> Done. Verify: viewport meta + / + a deep link on https://hereby-app.netlify.app"
