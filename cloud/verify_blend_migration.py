"""Verify strategy-blend migration columns on Cloud SQL."""
from run_single_migration import DB_NAME, INSTANCE, get_secret, verify_columns

from google.cloud.sql.connector import Connector


def main() -> int:
    user = get_secret("db-user")
    password = get_secret("db-password")
    connector = Connector()
    conn = connector.connect(INSTANCE, "pg8000", user=user, password=password, db=DB_NAME)
    try:
        cur = conn.cursor()
        verify_columns(cur)
        cur.close()
    finally:
        conn.close()
        connector.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
