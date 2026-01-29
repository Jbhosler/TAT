#!/bin/bash
# Master deployment script - runs all setup and deployment steps

set -e

PROJECT_ID="tax-aware-transition-tool"
REGION="us-central1"

echo "=========================================="
echo "Tax-Aware Transition Tool - Cloud Deployment"
echo "=========================================="
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI is not installed. Please install it first."
    exit 1
fi

# Set project
echo "Setting GCP project to ${PROJECT_ID}..."
gcloud config set project ${PROJECT_ID}

# Step 1: Enable APIs
echo ""
echo "Step 1: Enabling required Google Cloud APIs..."
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable storage-api.googleapis.com
gcloud services enable storage-component.googleapis.com
gcloud services enable containerregistry.googleapis.com
echo "✓ APIs enabled"

# Step 2: Setup Cloud SQL
echo ""
echo "Step 2: Setting up Cloud SQL database..."
echo "This will create a PostgreSQL instance (may take 5-10 minutes)..."
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    chmod +x cloud/setup-database.sh
    ./cloud/setup-database.sh
    echo "✓ Database setup complete"
else
    echo "Skipping database setup. Make sure to run it manually later."
fi

# Step 3: Setup Secrets
echo ""
echo "Step 3: Setting up Secret Manager..."
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    chmod +x cloud/setup-secrets.sh
    ./cloud/setup-secrets.sh
    echo "✓ Secrets setup complete"
else
    echo "Skipping secrets setup. Make sure to run it manually later."
fi

# Step 4: Run migrations
echo ""
echo "Step 4: Running database migrations..."
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    chmod +x cloud/run-migrations.sh
    ./cloud/run-migrations.sh
    echo "✓ Migrations complete"
else
    echo "Skipping migrations. Make sure to run them manually later."
fi

# Step 5: Deploy Backend
echo ""
echo "Step 5: Deploying backend to Cloud Run..."
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    chmod +x cloud/deploy.sh
    ./cloud/deploy.sh
    echo "✓ Backend deployed"
else
    echo "Skipping backend deployment."
fi

# Step 6: Deploy Frontend
echo ""
echo "Step 6: Deploying frontend to Cloud Storage..."
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    chmod +x cloud/deploy-frontend.sh
    ./cloud/deploy-frontend.sh
    echo "✓ Frontend deployed"
else
    echo "Skipping frontend deployment."
fi

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Get your backend URL from Cloud Run console"
echo "2. Update frontend/src/services/api.ts with the backend URL"
echo "3. Rebuild and redeploy frontend"
echo "4. Test the application"
echo ""
