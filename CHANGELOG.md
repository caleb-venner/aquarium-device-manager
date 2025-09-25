Changelog
=========

Unreleased
----------

Added
-----

* `CHIHIROS_STATUS_CAPTURE_WAIT` environment variable to tune the post-request status capture delay (default 1.5s). Lower for faster polling on stable adapters; raise if you see intermittent missing status frames.

Removed
-------

* Dropped legacy runtime import fallback (sys.path / importlib hack) from `service.py`.
* Removed transitional wrapper endpoints: `debug_live_status`, `set_doser_schedule`, `set_light_brightness` and archived `legacy_ui_archived`, `legacy_debug_archived` 410 routes. These paths now return 404.
* Removed legacy HTMX templates and unused empty `static/` directory (SPA + REST now primary interfaces).

Changed
-------

* Tests now exercise the real FastAPI router HTTP endpoints using `TestClient` instead of calling wrapper functions directly.
* Extracted SPA serving & asset routing tests into dedicated `tests/test_spa.py` for clarity.
* Mocking strategy in tests disables BLE auto-reconnect and state-loading side effects to avoid hardware interaction during CI.

Internal
--------

* Cleaned unused imports and constants tied to removed wrapper logic.

---

Prior versions did not maintain a formal changelog; future changes will append here following Keep a Changelog style (Unreleased section, then dated releases).
