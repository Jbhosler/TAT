#!/bin/bash
# Deployment script for Tax-Aware Transition Tool

set -e

PROJECT_ID="tax-aware-transition-tool"
REGION="us-central1"
SERVICE_NAME="tat-backend"
IMAGE_NAME="gcr.io/${PROJECT_ID}/tat-backend"

echo "Setting GCP project..."
gcloud config set project ${PROJECT_ID}

echo "Enabling required APIs..."
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable storage-api.googleapis.com
gcloud services enable storage-component.googleapis.com

echo "Building and deploying backend..."
gcloud builds submit --config cloud/cloudbuild.yaml

echo "Deployment complete!"
echo "Backend URL: https://${SERVICE_NAME}-${PROJECT_NUMBER}.a.run.app"
