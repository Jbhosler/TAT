# Backend Dockerfile for Cloud Run
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ ./backend/

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV PORT=8080

# Expose port (Cloud Run sets PORT env var, default to 8080)
EXPOSE 8080

# Run the application
# Cloud Run sets PORT environment variable automatically
# Use a startup script to handle PORT variable
RUN echo '#!/bin/sh\nPORT=${PORT:-8080}\nexec uvicorn backend.api.main:app --host 0.0.0.0 --port $PORT' > /app/start.sh && chmod +x /app/start.sh
CMD ["/app/start.sh"]
