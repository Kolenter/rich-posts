"""Admin API — только для ADMIN_IDS."""

from fastapi import APIRouter, Depends

from app.auth import require_admin
from app.users import dashboard_stats

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.get("/dashboard")
async def admin_dashboard(_admin: dict = Depends(require_admin)):
    return dashboard_stats()
