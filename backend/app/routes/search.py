"""
Search API router
"""
from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user
from app.search import search_anime

router = APIRouter(prefix="/api/search", tags=["search"], dependencies=[Depends(get_current_user)])


@router.get("/anime")
def search_anime_api(q: str = Query(..., min_length=2)):
    try:
        results = search_anime(q)
        return {"query": q, "results": results, "count": len(results)}
    except Exception as e:
        return {"error": str(e)}
