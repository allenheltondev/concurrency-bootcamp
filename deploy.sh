#!/usr/bin/env bash
# Deploy Concurrency Bootcamp: provision/update infra, upload the site, bust the cache.
# Usage: ./deploy.sh
set -euo pipefail

STACK="concurrency-bootcamp"
REGION="us-east-1"

echo "==> sam deploy ($STACK / $REGION)"
sam deploy --no-confirm-changeset --no-fail-on-empty-changeset

# Pull the resources the upload + invalidation need straight from the stack outputs.
get_output() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

BUCKET="$(get_output BucketName)"
DIST_ID="$(get_output DistributionId)"
URL="$(get_output SiteUrl)"

echo "==> upload to s3://$BUCKET"
# Short max-age so content updates surface quickly; invalidation below covers the gap.
aws s3 cp index.html "s3://$BUCKET/index.html" \
  --content-type "text/html; charset=utf-8" --cache-control "public, max-age=300" --region "$REGION"
aws s3 cp worker.js "s3://$BUCKET/worker.js" \
  --content-type "text/javascript; charset=utf-8" --cache-control "public, max-age=300" --region "$REGION"
# PWA assets. The service worker must not be cached long, or clients stay on stale builds.
aws s3 cp sw.js "s3://$BUCKET/sw.js" \
  --content-type "text/javascript; charset=utf-8" --cache-control "public, max-age=0, must-revalidate" --region "$REGION"
aws s3 cp manifest.webmanifest "s3://$BUCKET/manifest.webmanifest" \
  --content-type "application/manifest+json; charset=utf-8" --cache-control "public, max-age=300" --region "$REGION"
aws s3 cp icon.svg "s3://$BUCKET/icon.svg" \
  --content-type "image/svg+xml" --cache-control "public, max-age=300" --region "$REGION"

echo "==> invalidate /*"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" \
  --query "Invalidation.{Id:Id,Status:Status}" --output table

echo "==> done -> $URL"
