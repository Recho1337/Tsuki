"""
Auth API router
"""
from fastapi import APIRouter

from app.auth import create_access_token
from app.config import settings
from app.models import LoginRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(body: LoginRequest):
    if body.username == settings.anime_user and body.password == settings.anime_pass:
        token = create_access_token(subject=body.username)
        return {"token": token, "username": body.username}
    return {"error": "Invalid credentials"}, 401


@router.post("/verify")
def verify_token():
    """Endpoint just to check if the token is still valid (auth dependency on the router is enough)."""
    return {"valid": True}
