"""
Database connection module with Cloud SQL support.
Handles both local development (Cloud SQL Proxy) and production (Cloud SQL Connector).
"""
import os
import logging
from typing import Optional
from sqlalchemy import create_engine, Engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import NullPool

logger = logging.getLogger(__name__)

# Optional imports so route modules can load even if DB deps fail (e.g. missing in image)
try:
    import pg8000  # noqa: F401
    from google.cloud.sql.connector import Connector
    _connector_available = True
except ImportError as e:
    logger.warning("Database connector imports failed: %s. DB routes will fail at first use.", e)
    pg8000 = None
    Connector = None
    _connector_available = False


# BOM (U+FEFF) can appear when secrets are created from UTF-8 files; strip it so auth works
def _clean_secret(value: Optional[str], default: str = "") -> str:
    if value is None:
        return default
    s = value.strip().strip("\ufeff")
    return s if s else default


def get_cloud_sql_connector():
    """Initialize Cloud SQL Connector for production."""
    if not _connector_available or Connector is None:
        raise RuntimeError(
            "Cloud SQL Connector not available. Install cloud-sql-python-connector[pg8000] and pg8000 in the container."
        )
    return Connector()


def get_connection_string() -> str:
    """
    Get database connection string based on environment.
    Returns either Cloud SQL connection string or local PostgreSQL connection string.
    """
    use_proxy = os.getenv("USE_CLOUD_SQL_PROXY", "false").lower() == "true"
    db_host = _clean_secret(os.getenv("DB_HOST"), "")
    db_name = _clean_secret(os.getenv("DB_NAME"), "tat_database")
    db_user = _clean_secret(os.getenv("DB_USER"), "tat_user")
    db_password = _clean_secret(os.getenv("DB_PASSWORD"), "")

    if use_proxy:
        # Local development with Cloud SQL Proxy
        # Proxy typically runs on localhost:5432
        return f"postgresql+pg8000://{db_user}:{db_password}@127.0.0.1:5432/{db_name}"
    else:
        # Production: Use Cloud SQL Connector
        # Connection string will be handled by the connector
        project_id = os.getenv("GCP_PROJECT_ID", "tax-aware-transition-tool")
        region = os.getenv("GCP_REGION", "us-central1")
        instance_name = db_host.split(":")[-1] if ":" in db_host else db_host.split("/")[-1] if "/" in db_host else db_host
        connection_name = f"{project_id}:{region}:{instance_name}"
        
        # Return connection name for connector
        return connection_name


def create_engine_with_connector() -> Engine:
    """
    Create SQLAlchemy engine with Cloud SQL Connector for production.
    """
    if not _connector_available:
        raise RuntimeError(
            "Cloud SQL Connector not available. Install cloud-sql-python-connector[pg8000] and pg8000. "
            "Check Cloud Run logs for the original ImportError."
        )
    connection_name = get_connection_string()
    db_name = _clean_secret(os.getenv("DB_NAME"), "tat_database")
    db_user = _clean_secret(os.getenv("DB_USER"), "tat_user")
    db_password = _clean_secret(os.getenv("DB_PASSWORD"), "")

    def getconn():
        connector = get_cloud_sql_connector()
        conn = connector.connect(
            connection_name,
            "pg8000",
            user=db_user,
            password=db_password,
            db=db_name,
        )
        return conn
    
    engine = create_engine(
        "postgresql+pg8000://",
        creator=getconn,
        poolclass=NullPool,
    )
    return engine


def create_engine_local() -> Engine:
    """
    Create SQLAlchemy engine for local development (Cloud SQL Proxy or local PostgreSQL).
    """
    if pg8000 is None:
        raise RuntimeError("pg8000 not available. Install pg8000 in the container.")
    connection_string = get_connection_string()
    engine = create_engine(
        connection_string,
        pool_pre_ping=True,
        echo=os.getenv("ENVIRONMENT", "development") == "development",
    )
    return engine


def get_engine() -> Engine:
    """
    Get database engine based on environment configuration.
    """
    use_proxy = os.getenv("USE_CLOUD_SQL_PROXY", "false").lower() == "true"
    environment = os.getenv("ENVIRONMENT", "development")
    
    if environment == "production" and not use_proxy:
        return create_engine_with_connector()
    else:
        return create_engine_local()


# Lazy initialization - don't create engine at module import time
_engine = None
_SessionLocal = None


def get_engine_lazy() -> Engine:
    """Get or create engine lazily (only when needed)."""
    global _engine
    if _engine is None:
        _engine = get_engine()
    return _engine


def get_session_local():
    """Get or create session factory lazily."""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=get_engine_lazy())
    return _SessionLocal


def get_db() -> Session:
    """
    Dependency function for FastAPI to get database session.
    """
    SessionLocal = get_session_local()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
