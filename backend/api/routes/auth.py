"""
Authentication routes - passcode validation.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os

router = APIRouter()


@router.get("")
async def auth_router_ok():
    """Confirm auth router is mounted (GET /api/auth returns 200)."""
    return {"ok": True, "message": "auth router loaded"}


class PasscodeRequest(BaseModel):
    passcode: str


class PasscodeResponse(BaseModel):
    valid: bool
    token: str = None


@router.post("/validate", response_model=PasscodeResponse)
async def validate_passcode(request: PasscodeRequest):
    """
    Validate passcode (007).
    In production, this would generate a JWT token.
    """
    expected_passcode = os.getenv("PASSCODE", "007")
    
    if request.passcode == expected_passcode:
        # In production, generate JWT token here
        # For now, return simple success
        return PasscodeResponse(
            valid=True,
            token="authenticated"  # Placeholder - use JWT in production
        )
    else:
        raise HTTPException(status_code=401, detail="Invalid passcode")
