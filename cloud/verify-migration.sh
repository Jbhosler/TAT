#!/bin/bash
# Verify database migration was successful

echo "Verifying database migration..."
echo ""

# Connect and check tables
gcloud sql connect tat-db-instance --user=postgres --database=tat_database << 'EOF'
\dt
\q
EOF

echo ""
echo "If you see tables like 'strategies', 'strategy_positions', etc., the migration succeeded!"
