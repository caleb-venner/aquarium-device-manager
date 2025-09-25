"""Tests specifically for SPA serving and asset routing logic."""
from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from fastapi.responses import HTMLResponse

from chihiros_device_manager.service import (
    SPA_UNAVAILABLE_MESSAGE,
    serve_spa,
    serve_spa_assets,
)


def test_root_reports_missing_spa(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Expose a helpful 503 when neither SPA bundle nor dev server exist."""
    monkeypatch.setattr(
        "chihiros_device_manager.service.SPA_DIST_AVAILABLE", False
    )
    monkeypatch.setattr(
        "chihiros_device_manager.service._proxy_dev_server",
        AsyncMock(return_value=None),
    )

    response = asyncio.run(serve_spa())
    assert response.status_code == 503
    assert SPA_UNAVAILABLE_MESSAGE in response.body.decode()


def test_root_serves_spa_when_dist_present(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Return the compiled SPA index when the build directory exists."""
    index_file = tmp_path / "index.html"
    index_file.write_text("<html><body>spa</body></html>", encoding="utf-8")
    monkeypatch.setattr(
        "chihiros_device_manager.service.SPA_DIST_AVAILABLE", True
    )
    monkeypatch.setattr(
        "chihiros_device_manager.service.FRONTEND_DIST", tmp_path
    )
    response = asyncio.run(serve_spa())
    assert response.status_code == 200
    assert "spa" in response.body.decode()


def test_spa_asset_route_serves_static_file(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Return static assets from the compiled SPA directory."""
    asset = tmp_path / "vite.svg"
    asset.write_text("svg", encoding="utf-8")
    monkeypatch.setattr(
        "chihiros_device_manager.service.SPA_DIST_AVAILABLE", True
    )
    monkeypatch.setattr(
        "chihiros_device_manager.service.FRONTEND_DIST", tmp_path
    )

    response = asyncio.run(serve_spa_assets("vite.svg"))
    assert response.status_code == 200
    assert getattr(response, "path", None) == asset


def test_spa_asset_route_returns_index_for_client_paths(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Serve the SPA index for non-file client-side routes."""
    index_file = tmp_path / "index.html"
    index_file.write_text("<html><body>spa</body></html>", encoding="utf-8")
    monkeypatch.setattr(
        "chihiros_device_manager.service.SPA_DIST_AVAILABLE", True
    )
    monkeypatch.setattr(
        "chihiros_device_manager.service.FRONTEND_DIST", tmp_path
    )

    response = asyncio.run(serve_spa_assets("dashboard"))
    assert response.status_code == 200
    assert "spa" in response.body.decode()


def test_spa_asset_route_404_for_missing_files(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Missing assets should not fall back to the SPA index."""
    monkeypatch.setattr(
        "chihiros_device_manager.service.SPA_DIST_AVAILABLE", True
    )
    monkeypatch.setattr(
        "chihiros_device_manager.service.FRONTEND_DIST", tmp_path
    )

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(serve_spa_assets("app.js"))

    assert excinfo.value.status_code == 404


def test_root_proxies_dev_server(monkeypatch: pytest.MonkeyPatch) -> None:
    """Serve the SPA from the dev server when no build artifacts exist."""
    monkeypatch.setattr(
        "chihiros_device_manager.service.SPA_DIST_AVAILABLE", False
    )
    proxied = HTMLResponse("dev")
    helper = AsyncMock(return_value=proxied)
    monkeypatch.setattr(
        "chihiros_device_manager.service._proxy_dev_server", helper
    )

    response = asyncio.run(serve_spa())
    assert response is proxied
    helper.assert_awaited_once_with("/")


def test_spa_asset_route_proxies_dev_server(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Proxy SPA asset requests to the Vite dev server when available."""
    monkeypatch.setattr(
        "chihiros_device_manager.service.SPA_DIST_AVAILABLE", False
    )
    proxied = HTMLResponse("console.log('dev')")
    helper = AsyncMock(return_value=proxied)
    monkeypatch.setattr(
        "chihiros_device_manager.service._proxy_dev_server", helper
    )

    response = asyncio.run(serve_spa_assets("src/main.ts"))
    assert response is proxied
    helper.assert_awaited_once_with("/src/main.ts")
