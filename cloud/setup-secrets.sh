#!/bin/bash
# Setup Google Secret Manager secrets

set -e

PROJECT_ID="tax-aware-transition-tool"

echo "Setting GCP project..."
gcloud config set project ${PROJECT_ID}

echo "Creating secrets in Secret Manager..."
echo "Please enter the database name:"
read DB_NAME
echo -n "$DB_NAME" | gcloud secrets create db-name --data-file=- --replication-policy="automatic" || \
  echo -n "$DB_NAME" | gcloud secrets versions add db-name --data-file=-

echo "Please enter the database user:"
read DB_USER
echo -n "$DB_USER" | gcloud secrets create db-user --data-file=- --replication-policy="automatic" || \
  echo -n "$DB_USER" | gcloud secrets versions add db-user --data-file=-

echo "Please enter the database password:"
read -s DB_PASSWORD
echo -n "$DB_PASSWORD" | gcloud secrets create db-password --data-file=- --replication-policy="automatic" || \
  echo -n "$DB_PASSWORD" | gcloud secrets versions add db-password --data-file=-

echo "Granting Cloud Run service account access to secrets..."
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud secrets add-iam-policy-binding db-name \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding db-user \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding db-password \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

echo "Secrets setup complete!"
