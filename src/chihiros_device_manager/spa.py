from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import httpx
from fastapi import HTTPException
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles


PACKAGE_ROOT = Path(__file__).resolve().parent
DEFAULT_FRONTEND_DIST = PACKAGE_ROOT.parent.parent / "frontend" / "dist"
FRONTEND_DIST = Path(os.getenv("CHIHIROS_FRONTEND_DIST", str(DEFAULT_FRONTEND_DIST)))
SPA_DIST_AVAILABLE = FRONTEND_DIST.exists()

SPA_UNAVAILABLE_MESSAGE = (
    "The TypeScript dashboard is unavailable. "
    "Build the SPA (npm run build) or start the dev server (npm run dev) "
    "before visiting '/' again."
)


_DEV_SERVER_ENV = os.getenv("CHIHIROS_FRONTEND_DEV_SERVER", "").strip()
if _DEV_SERVER_ENV == "0":
    DEV_SERVER_CANDIDATES: tuple[httpx.URL, ...] = ()
elif _DEV_SERVER_ENV:
    DEV_SERVER_CANDIDATES = (httpx.URL(_DEV_SERVER_ENV.rstrip("/")),)
else:
    DEV_SERVER_CANDIDATES = (
        httpx.URL("http://127.0.0.1:5173"),
        httpx.URL("http://localhost:5173"),
    )

DEV_SERVER_TIMEOUT = httpx.Timeout(connect=1.0, read=5.0, write=5.0, pool=1.0)
_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-length",
}


def mount_assets(app) -> None:
    if SPA_DIST_AVAILABLE:
        assets_dir = FRONTEND_DIST / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="spa-assets")


async def serve_index_or_proxy() -> Response:
    if SPA_DIST_AVAILABLE:
        index_path = FRONTEND_DIST / "index.html"
        if index_path.exists():
            return HTMLResponse(index_path.read_text(encoding="utf-8"))
    proxied = await _proxy_dev_server("/")
    if proxied is not None:
        return proxied
    return Response(
        SPA_UNAVAILABLE_MESSAGE,
        status_code=503,
        media_type="text/plain",
        headers={"cache-control": "no-store"},
    )


async def serve_spa_asset(spa_path: str) -> Response:
    if not spa_path:
        raise HTTPException(status_code=404)

    first_segment = spa_path.split("/", 1)[0]
    if first_segment in {"api"} or spa_path in {"docs", "redoc", "openapi.json"}:
        raise HTTPException(status_code=404)

    if not SPA_DIST_AVAILABLE:
        proxied = await _proxy_dev_server(f"/{spa_path}")
        if proxied is not None:
            return proxied
        raise HTTPException(status_code=404, detail="SPA bundle unavailable")

    asset_path = FRONTEND_DIST / spa_path
    if asset_path.is_file():
        return FileResponse(asset_path)

    if "." in spa_path:
        raise HTTPException(status_code=404)

    index_path = FRONTEND_DIST / "index.html"
    if index_path.exists():
        return HTMLResponse(index_path.read_text(encoding="utf-8"))

    raise HTTPException(status_code=404)


async def _proxy_dev_server(path: str) -> Optional[Response]:
    if not DEV_SERVER_CANDIDATES:
        return None
    normalized = path if path.startswith("/") else f"/{path}"
    for base_url in DEV_SERVER_CANDIDATES:
        try:
            async with httpx.AsyncClient(base_url=str(base_url), timeout=DEV_SERVER_TIMEOUT) as client:
                response = await client.get(normalized, follow_redirects=True)
        except httpx.HTTPError:
            continue
        headers = {key: value for key, value in response.headers.items() if key.lower() not in _HOP_HEADERS}
        return Response(content=response.content, status_code=response.status_code, headers=headers)
    return None
