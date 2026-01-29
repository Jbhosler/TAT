#!/bin/bash
# Setup Google Cloud SQL PostgreSQL instance

set -e

PROJECT_ID="tax-aware-transition-tool"
REGION="us-central1"
INSTANCE_NAME="tat-db-instance"
DATABASE_NAME="tat_database"
DB_USER="tat_user"

echo "Setting GCP project..."
gcloud config set project ${PROJECT_ID}

echo "Creating Cloud SQL instance (this may take several minutes)..."
gcloud sql instances create ${INSTANCE_NAME} \
  --database-version=POSTGRES_14 \
  --tier=db-f1-micro \
  --region=${REGION} \
  --storage-type=SSD \
  --storage-size=20GB \
  --storage-auto-increase \
  --backup-start-time=03:00 \
  --enable-bin-log \
  --maintenance-window-day=SUN \
  --maintenance-window-hour=04 \
  --network=default \
  --no-assign-ip || echo "Instance may already exist"

echo "Waiting for instance to be ready..."
sleep 30

echo "Creating database..."
gcloud sql databases create ${DATABASE_NAME} \
  --instance=${INSTANCE_NAME} || echo "Database may already exist"

echo "Creating database user..."
echo "Please enter a password for the database user:"
read -s DB_PASSWORD

gcloud sql users create ${DB_USER} \
  --instance=${INSTANCE_NAME} \
  --password=${DB_PASSWORD} || echo "User may already exist"

echo "Getting connection name..."
CONNECTION_NAME=$(gcloud sql instances describe ${INSTANCE_NAME} --format="value(connectionName)")
echo "Connection name: ${CONNECTION_NAME}"

echo "Database setup complete!"
echo "Connection name: ${CONNECTION_NAME}"
echo "Please save the database password and run setup-secrets.sh to store it in Secret Manager"
