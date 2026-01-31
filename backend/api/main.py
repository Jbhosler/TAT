"""
FastAPI main application entry point.
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware
import logging
import os
import sys

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Log startup
logger.info("Starting FastAPI application...")

app = FastAPI(
    title="Auour Tax-Aware Transition Tool API",
    description="Portfolio transition engine with tax-aware rebalancing",
    version="1.0.0"
)

# Add explicit CORS handler FIRST (middleware runs in reverse order)
# This ensures CORS headers are added to ALL responses
@app.middleware("http")
async def cors_handler(request: Request, call_next):
    """Handle CORS for all requests - runs FIRST."""
    origin = request.headers.get("origin", "unknown")
    logger.info(f"CORS handler: {request.method} {request.url.path} from origin: {origin}")
    
    if request.method == "OPTIONS":
        logger.info(f"OPTIONS preflight intercepted for {request.url.path}")
        response = Response(status_code=200)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Max-Age"] = "3600"
        logger.info(f"CORS headers added to OPTIONS response")
        return response
    
    # For all other requests, add CORS headers to response
    try:
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "*"
        logger.info(f"CORS headers added to {request.method} response for {request.url.path}")
        return response
    except Exception as e:
        logger.error(f"Error in CORS handler: {e}", exc_info=True)
        # Even on error, return CORS headers
        error_response = Response(
            status_code=500,
            content='{"detail": "Internal server error"}',
            media_type="application/json"
        )
        error_response.headers["Access-Control-Allow-Origin"] = "*"
        error_response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        error_response.headers["Access-Control-Allow-Headers"] = "*"
        return error_response

# CORS middleware - MUST be added before routers
# Allow requests from Cloud Storage and any other origins
# Note: allow_credentials must be False when using wildcard origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (Cloud Storage, localhost, etc.)
    allow_credentials=False,  # Must be False when using wildcard origins
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],  # Allow all headers - browsers send various headers in preflight
    expose_headers=["*"],
    max_age=3600,
)

# Load routers one by one so one failure doesn't block the rest; log each so logs show the failure
logger.info("Loading API routers...")
try:
    from backend.api.routes import auth
    app.include_router(auth.router, prefix="/api/auth", tags=["authentication"])
    logger.info("Auth router loaded")
except Exception as e:
    logger.error(f"Error loading auth router: {e}", exc_info=True)

def _load_router(name: str, module_attr: str, prefix: str, tag: str):
    try:
        mod = __import__(f"backend.api.routes.{module_attr}", fromlist=[module_attr])
        router = getattr(mod, "router")
        app.include_router(router, prefix=prefix, tags=[tag])
        logger.info("%s router loaded", name)
    except Exception as e:
        logger.error("Error loading %s router: %s", name, e, exc_info=True)

_load_router("strategies", "strategies", "/api/strategies", "strategies")
_load_router("prospects", "prospects", "/api/prospects", "prospects")
_load_router("admin", "admin", "/api/admin", "admin")
_load_router("monitoring", "monitoring", "/api/monitoring", "monitoring")


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup (non-blocking)."""
    import asyncio
    # Run database initialization in background to not block startup
    async def init_db_async():
        try:
            from backend.database.connection import get_engine_lazy
            from backend.api.models.database import Base
            engine = get_engine_lazy()
            Base.metadata.create_all(bind=engine)
            logger.info("Database tables verified/created successfully")
        except Exception as e:
            logger.warning(f"Could not initialize database (will retry on first request): {e}")
    
    # Don't await - let it run in background
    asyncio.create_task(init_db_async())

# Exception handlers to ensure CORS headers are on error responses
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Ensure CORS headers are on HTTP exceptions."""
    response = JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Ensure CORS headers are on validation errors."""
    response = JSONResponse(
        status_code=422,
        content={"detail": exc.errors()}
    )
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Ensure CORS headers are on all exceptions."""
    import traceback
    error_trace = traceback.format_exc()
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}\n{error_trace}")
    response = JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"}
    )
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

@app.get("/api/health")
async def health_check():
    """Health check endpoint for Cloud Run - no database required."""
    return {"status": "healthy", "service": "tat-backend"}


@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "Auour Tax-Aware Transition Tool API"}
