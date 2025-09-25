"""Legacy / diagnostic CLI for direct BLE access.

This CLI has been moved under tools/ and is no longer used by the
FastAPI service runtime. Prefer interacting with devices via the
`chihiros-service` REST API and SPA dashboard. The CLI remains for:

* Low-level experimentation with raw BLE commands.
* Manual troubleshooting of dosing pumps and lights.
* Exploration of protocol details ahead of UI/REST exposure.

Future direction: convert this into a thin HTTP client that delegates to
the running service instead of performing BLE operations directly.
"""

from chihiros_device_manager.chihirosctl import app  # re-export Typer app

__all__ = ["app"]
