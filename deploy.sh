#!/bin/bash
# aTek Git deployment script for Cloudflare Pages

# Prompt the user for the commit message/tag
#read -p "Enter commit message: " COMMIT_MSG

# Prevent empty commit messages from halting the pipeline
#if [ -z "$COMMIT_MSG" ]; then
#  echo "Commit message cannot be empty. Aborting."
#  exit 1
#fi

# Stage all new and modified files
#echo "Staging files..."
#git add .

# Commit with the provided string
#echo "Committing changes..."
#git commit -m "$COMMIT_MSG"

# Push to the remote repository to trigger the Cloudflare build
#echo "Pushing to origin main..."
#git push origin main

#echo "Deployment pushed successfully."
npx wrangler pages deploy . --project-name=atek-website --branch=main