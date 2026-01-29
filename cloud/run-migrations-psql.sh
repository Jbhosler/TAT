#!/bin/bash
# Run migrations using psql via Cloud SQL Proxy or direct connection
# This is the most reliable method

set -e

PROJECT_ID="tax-aware-transition-tool"
INSTANCE_NAME="tat-db-instance"
DATABASE_NAME="tat_database"
DB_USER="postgres"

echo "=========================================="
echo "Running Database Migrations"
echo "=========================================="
echo ""

# Method 1: Use gcloud sql connect with here-document
echo "Method 1: Using gcloud sql connect..."
echo "Note: You may need to enter the database password"
echo ""

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SQL_FILE="$SCRIPT_DIR/init-db-safe.sql"

if [ ! -f "$SQL_FILE" ]; then
    echo "Error: SQL file not found at $SQL_FILE"
    exit 1
fi

echo "Executing SQL from: $SQL_FILE"
echo ""

# Use gcloud sql connect with input redirection
# This should work in Cloud Shell
gcloud sql connect $INSTANCE_NAME --user=$DB_USER --database=$DATABASE_NAME < "$SQL_FILE"

echo ""
echo "=========================================="
echo "Migrations Complete!"
echo "=========================================="
