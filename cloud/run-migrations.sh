#!/bin/bash
# Run database migrations on Cloud SQL

set -e

PROJECT_ID="tax-aware-transition-tool"
INSTANCE_NAME="tat-db-instance"
DATABASE_NAME="tat_database"

echo "Setting GCP project..."
gcloud config set project ${PROJECT_ID}

echo "Running database migrations..."
gcloud sql connect ${INSTANCE_NAME} --user=postgres --database=${DATABASE_NAME} < cloud/init-db.sql

echo "Migrations complete!"
