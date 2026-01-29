# Windows Deployment Guide

## Prerequisites

You need a bash environment to run the deployment scripts. Choose one:

### Option A: WSL (Windows Subsystem for Linux) - Recommended

1. Install WSL if not already installed:
   ```powershell
   wsl --install
   ```

2. Open WSL terminal (Ubuntu)

3. Navigate to your project:
   ```bash
   cd /mnt/c/Users/JosephHosler/TAT
   ```

4. Run the deployment:
   ```bash
   cd cloud
   chmod +x deploy-all.sh
   ./deploy-all.sh
   ```

### Option B: Git Bash

1. Open Git Bash (from Git for Windows)

2. Navigate to your project:
   ```bash
   cd /c/Users/JosephHosler/TAT
   ```

3. Run the deployment:
   ```bash
   cd cloud
   chmod +x deploy-all.sh
   ./deploy-all.sh
   ```

### Option C: Run Commands Directly in PowerShell

Instead of using the bash scripts, you can run the gcloud commands directly in PowerShell:

```powershell
# Set project
gcloud config set project tax-aware-transition-tool

# Enable APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable storage-api.googleapis.com
gcloud services enable storage-component.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Create Cloud SQL instance
gcloud sql instances create tat-db-instance `
  --database-version=POSTGRES_14 `
  --tier=db-f1-micro `
  --region=us-central1 `
  --storage-type=SSD `
  --storage-size=20GB `
  --storage-auto-increase `
  --backup-start-time=03:00 `
  --enable-bin-log `
  --maintenance-window-day=SUN `
  --maintenance-window-hour=04 `
  --network=default `
  --no-assign-ip

# Create database
gcloud sql databases create tat_database --instance=tat-db-instance

# Create user (you'll be prompted for password)
gcloud sql users create tat_user --instance=tat-db-instance

# Get connection name
gcloud sql instances describe tat-db-instance --format="value(connectionName)"
```

## Quick Start (WSL or Git Bash)

```bash
cd /mnt/c/Users/JosephHosler/TAT/cloud  # or /c/Users/JosephHosler/TAT/cloud in Git Bash
chmod +x deploy-all.sh
./deploy-all.sh
```

## Manual Steps (PowerShell Alternative)

If you prefer PowerShell, you can follow the manual steps in `DEPLOYMENT.md` but use PowerShell syntax instead of bash.
