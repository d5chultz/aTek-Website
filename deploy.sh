#!/bin/bash
# aTek direct deployment script for Cloudflare Pages (via Wrangler)

# Ensure Node v22+ is prioritized over system Node v18
if [ -d "$HOME/.nvm/versions/node/v22.23.5/bin" ]; then
    export PATH="$HOME/.nvm/versions/node/v22.23.5/bin:$PATH"
elif [ -s "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
    nvm use 22 >/dev/null 2>&1
fi

export CLOUDFLARE_ACCOUNT_ID="6783a90d2e23f2d7870c14cb36d921fe"

echo "🚀 Deploying to Cloudflare Pages (atek-website)..."
npx wrangler pages deploy . --project-name=atek-website --branch=main "$@"
