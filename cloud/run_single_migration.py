"""Run a single SQL migration file against Cloud SQL via the Python connector."""
import base64
import json
import subprocess
import sys
from pathlib import Path

from google.cloud.sql.connector import Connector

GCLOUD = r"C:\Users\JosephHosler\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
PROJECT = "tax-aware-transition-tool"
INSTANCE = f"{PROJECT}:us-central1:tat-db-instance"
DB_NAME = "tat_database"


def get_secret(name: str) -> str:
    raw = subprocess.check_output(
        [GCLOUD, "secrets", "versions", "access", "latest", f"--secret={name}", "--format=json"]
    )
    payload = json.loads(raw.decode("utf-8-sig"))["payload"]["data"]
    padded = payload + "=" * (-len(payload) % 4)
    return base64.urlsafe_b64decode(padded).decode("utf-8-sig").strip()


def split_statements(sql: str) -> list[str]:
    parts: list[str] = []
    for chunk in sql.split(";"):
        lines = [ln for ln in chunk.splitlines() if ln.strip() and not ln.strip().startswith("--")]
        stmt = "\n".join(lines).strip()
        if stmt:
            parts.append(stmt)
    return parts


def verify_columns(cur) -> None:
    for table, column in (
        ("transition_results", "target_positions"),
        ("transition_results", "strategy_versions_snapshot"),
        ("prospects", "strategy_blend"),
        ("prospects", "strategy_account_links"),
    ):
        cur.execute(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_name = %s AND column_name = %s
            """,
            (table, column),
        )
        found = cur.fetchone()
        print(f"verify {table}.{column}:", "present" if found else "MISSING")


def main(sql_path: Path) -> int:
    user = get_secret("db-user")
    password = get_secret("db-password")
    sql = sql_path.read_text(encoding="utf-8")
    statements = split_statements(sql)

    connector = Connector()
    conn = connector.connect(INSTANCE, "pg8000", user=user, password=password, db=DB_NAME)
    try:
        cur = conn.cursor()
        for stmt in statements:
            cur.execute(stmt)
            print("OK:", stmt.split("\n", 1)[0][:100])
        conn.commit()

        verify_columns(cur)
        cur.close()
    finally:
        conn.close()
        connector.close()
    return 0


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("add-prospect-strategy-blend.sql")
    raise SystemExit(main(path))
