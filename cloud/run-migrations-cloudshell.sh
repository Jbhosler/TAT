#!/bin/bash
# Run database migrations in Cloud Shell
# This script executes the SQL file using psql

set -e

PROJECT_ID="tax-aware-transition-tool"
INSTANCE_NAME="tat-db-instance"
DATABASE_NAME="tat_database"
DB_USER="postgres"

echo "Running database migrations..."
echo ""

# Get the connection name
CONNECTION_NAME=$(gcloud sql instances describe $INSTANCE_NAME --format="value(connectionName)")

echo "Connection name: $CONNECTION_NAME"
echo ""

# Execute SQL file using gcloud sql connect
# This will open an interactive psql session
echo "Executing SQL migrations..."
gcloud sql connect $INSTANCE_NAME --user=$DB_USER --database=$DATABASE_NAME <<EOF
$(cat init-db-safe.sql)
\q
EOF

echo ""
echo "Migrations complete!"
