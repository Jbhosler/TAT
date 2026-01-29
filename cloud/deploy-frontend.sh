#!/bin/bash
# Deploy frontend to Cloud Storage

set -e

PROJECT_ID="tax-aware-transition-tool"
BUCKET_NAME="tat-frontend-${PROJECT_ID}"
REGION="us-central1"

echo "Setting GCP project..."
gcloud config set project ${PROJECT_ID}

echo "Creating Cloud Storage bucket (if it doesn't exist)..."
gsutil mb -p ${PROJECT_ID} -c STANDARD -l ${REGION} gs://${BUCKET_NAME}/ || echo "Bucket may already exist"

echo "Building frontend..."
cd frontend
npm install
npm run build
cd ..

echo "Uploading frontend to Cloud Storage..."
gsutil -m rsync -r frontend/dist gs://${BUCKET_NAME}

echo "Setting bucket permissions for public read..."
gsutil iam ch allUsers:objectViewer gs://${BUCKET_NAME}

echo "Setting website configuration..."
gsutil web set -m index.html -e index.html gs://${BUCKET_NAME}

echo "Frontend deployed!"
echo "Frontend URL: https://storage.googleapis.com/${BUCKET_NAME}/index.html"
echo ""
echo "To set up a custom domain, configure Cloud CDN and point your domain to the bucket."
