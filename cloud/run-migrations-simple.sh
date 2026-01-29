#!/bin/bash
# Simple migration runner - executes SQL file line by line
# Use this if the above doesn't work

set -e

PROJECT_ID="tax-aware-transition-tool"
INSTANCE_NAME="tat-db-instance"
DATABASE_NAME="tat_database"
DB_USER="postgres"

echo "Running database migrations..."
echo ""

# Read SQL file and execute each statement
while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines and comments
    if [[ -z "$line" ]] || [[ "$line" =~ ^[[:space:]]*-- ]]; then
        continue
    fi
    
    # Execute the line
    echo "Executing: $line"
    echo "$line" | gcloud sql connect $INSTANCE_NAME --user=$DB_USER --database=$DATABASE_NAME --quiet
done < init-db-safe.sql

echo ""
echo "Migrations complete!"
