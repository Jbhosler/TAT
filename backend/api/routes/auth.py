"""
Authentication routes for magic-link and JWT auth.
"""
import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

import requests
from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.api.deps import get_current_user
from backend.api.models.database import AuthorizedUser, MagicLinkToken
from backend.api.models.schemas import (
    AuthMeResponse,
    RequestMagicLinkRequest,
    VerifyMagicLinkRequest,
    VerifyMagicLinkResponse,
)
from backend.database.connection import get_db

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("")
async def auth_router_ok():
    """Confirm auth router is mounted (GET /api/auth returns 200)."""
    return {"ok": True, "message": "auth router loaded"}


class PasscodeRequest(BaseModel):
    passcode: str


class PasscodeResponse(BaseModel):
    valid: bool
    token: str | None = None


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _create_jwt(email: str, role: str) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": email.strip().lower(),
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=8)).timestamp()),
    }
    secret = os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY")
    if not secret:
        raise HTTPException(status_code=500, detail="JWT secret is not configured")
    return jwt.encode(payload, secret, algorithm="HS256")


def _send_magic_link_email(to_email: str, verification_link: str) -> None:
    api_key = os.getenv("RESEND_API_KEY")
    from_email = os.getenv("FROM_EMAIL", "noreply@auourinvest.com")
    if not api_key:
        raise RuntimeError("RESEND_API_KEY is not configured")

    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": "Your sign-in link",
        "html": (
            "<p>Use the link below to sign in. This link expires in 15 minutes.</p>"
            f"<p><a href=\"{verification_link}\">Sign in to Auour</a></p>"
            "<p>If you did not request this email, you can ignore it.</p>"
        ),
    }
    response = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=20,
    )
    if not response.ok:
        raise RuntimeError(f"Resend API error {response.status_code}: {response.text}")


@router.post("/validate", response_model=PasscodeResponse)
async def validate_passcode(request: PasscodeRequest):
    """
    Temporary fallback auth while portal/magic-link delivery is stabilized.
    """
    expected_passcode = os.getenv("PASSCODE", "007")
    if request.passcode == expected_passcode:
        return PasscodeResponse(valid=True, token="authenticated")
    raise HTTPException(status_code=401, detail="Invalid passcode")


@router.post("/request-link")
async def request_magic_link(request: RequestMagicLinkRequest, db: Session = Depends(get_db)):
    """
    Request a magic sign-in link.
    Always return success-shaped response to avoid user enumeration.
    """
    email = request.email
    user = (
        db.query(AuthorizedUser)
        .filter(AuthorizedUser.email == email, AuthorizedUser.is_active.is_(True))
        .first()
    )
    if not user:
        return {"ok": True, "message": "If that email is allowed, a link has been sent."}

    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)
    expires_at = datetime.now(tz=timezone.utc) + timedelta(minutes=15)

    db.query(MagicLinkToken).filter(
        MagicLinkToken.email == email, MagicLinkToken.used_at.is_(None)
    ).delete()
    db.add(MagicLinkToken(email=email, token_hash=token_hash, expires_at=expires_at))
    db.commit()

    portal_url = os.getenv("PORTAL_URL", "https://auourinvest.com").rstrip("/")
    if portal_url.endswith(".html"):
        verify_link = f"{portal_url}#/auth/verify?token={raw_token}"
    else:
        verify_link = f"{portal_url}/#/auth/verify?token={raw_token}"
    try:
        _send_magic_link_email(email, verify_link)
    except Exception as exc:
        logger.error("Failed to send magic link email: %s", exc, exc_info=True)
    return {"ok": True, "message": "If that email is allowed, a link has been sent."}


@router.post("/verify-link", response_model=VerifyMagicLinkResponse)
async def verify_magic_link(request: VerifyMagicLinkRequest, db: Session = Depends(get_db)):
    """Verify magic link token and return auth JWT."""
    token_hash = _hash_token(request.token)
    now = datetime.now(tz=timezone.utc)
    token_row = (
        db.query(MagicLinkToken)
        .filter(
            MagicLinkToken.token_hash == token_hash,
            MagicLinkToken.used_at.is_(None),
            MagicLinkToken.expires_at >= now,
        )
        .first()
    )
    if not token_row:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = (
        db.query(AuthorizedUser)
        .filter(
            AuthorizedUser.email == token_row.email,
            AuthorizedUser.is_active.is_(True),
        )
        .first()
    )
    if not user:
        raise HTTPException(status_code=401, detail="User not authorized")

    token_row.used_at = now
    db.commit()
    auth_token = _create_jwt(user.email, user.role)
    return VerifyMagicLinkResponse(token=auth_token, role=user.role, email=user.email)


@router.get("/me", response_model=AuthMeResponse)
async def auth_me(current_user=Depends(get_current_user)):
    """Return current authenticated user details."""
    return AuthMeResponse(email=current_user["email"], role=current_user["role"])
