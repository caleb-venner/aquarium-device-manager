Changelog
=========

Unreleased
----------Changelog
=========

## [2.0.0] - 2025-01-08

### BREAKING CHANGES

* **Package renamed**: `chihiros-device-manager` → `aquarium-device-manager`
* **Python module renamed**: `chihiros_device_manager` → `aquarium_device_manager`
* **CLI command renamed**: `chihiros-service` → `aquarium-service`
* Users must uninstall the old package and reinstall with the new name
* Any code importing this package must update import statements

### Added

* Full rebrand to "Aquarium BLE Device Manager" for copyright compliance
* Backward-compatible configuration migration system
* Environment variables now use `AQUA_BLE_*` prefix (old `CHIHIROS_*` still supported)
* Config directory migrated to `~/.aqua-ble/` (auto-migrates from `~/.chihiros/`)
* Comprehensive migration documentation

### Changed

* All user-facing text updated to "Aquarium BLE Device Manager"
* Environment variable naming standardized to `AQUA_BLE_*` prefix
* `CHIHIROS_STATUS_CAPTURE_WAIT` → `AQUA_BLE_STATUS_WAIT`
* `CHIHIROS_AUTO_DISCOVER_ON_START` → `AQUA_BLE_AUTO_DISCOVER`
* `CHIHIROS_AUTO_RECONNECT` → `AQUA_BLE_AUTO_RECONNECT`
* `CHIHIROS_FRONTEND_DEV_SERVER` → `AQUA_BLE_FRONTEND_DEV`
* Makefile updated to use new environment variable names

### Fixed

* Bug in light device loading that referenced incorrect attribute name (`profiles` → `configurations`)

### Deprecated

* Old `CHIHIROS_*` environment variables (still supported via fallback, will show deprecation warning)
* Old config directory `~/.chihiros/` (automatically migrated on first run)

---

## Unreleased (Pre-2.0)

### Added

* `CHIHIROS_STATUS_CAPTURE_WAIT` environment variable to tune the post-request status capture delay (default 1.5s). Lower for faster polling on stable adapters; raise if you see intermittent missing status frames.
* Frontend onboarding when no devices are cached: a Scan/Connect panel that calls the new `/api/scan` and `/api/devices/{address}/connect` endpoints.
* Optional startup automation via `CHIHIROS_AUTO_DISCOVER_ON_START=1` to perform a one-off scan and auto-connect on first run (no cached devices).

### Deprecated

* **CLI Tool (`chihirosctl`)**: Now designated as developer-only debugging tool. Direct BLE access will not be further developed or integrated with REST API. Use FastAPI service + SPA for production control.

### Removed

* Dropped legacy runtime import fallback (sys.path / importlib hack) from `service.py`.
* Removed transitional wrapper endpoints: `debug_live_status`, `set_doser_schedule`, `set_light_brightness` and archived `legacy_ui_archived`, `legacy_debug_archived` 410 routes. These paths now return 404.
* Removed legacy HTMX templates and unused empty `static/` directory (SPA + REST now primary interfaces).
* Removed the duplicate `chihiros_device_manager/api.py` module in favour of `core_api` to avoid package/module name collisions.

### Changed

* Tests now exercise the real FastAPI router HTTP endpoints using `TestClient` instead of calling wrapper functions directly.
* Extracted SPA serving & asset routing tests into dedicated `tests/test_spa.py` for clarity.
* Mocking strategy in tests disables BLE auto-reconnect and state-loading side effects to avoid hardware interaction during CI.

### Internal

* Cleaned unused imports and constants tied to removed wrapper logic.
* Normalised boolean environment variable parsing (`true/false`, `yes/no`, `on/off`, or `0/1`).

### Fixed

* Doser status parsing now tolerates a ±1 minute mismatch between the header time and the body's leading time triplet, skipping preamble bytes when present to avoid mis-decoding head data.
Added
-----

* `CHIHIROS_STATUS_CAPTURE_WAIT` environment variable to tune the post-request status capture delay (default 1.5s). Lower for faster polling on stable adapters; raise if you see intermittent missing status frames.
* Frontend onboarding when no devices are cached: a Scan/Connect panel that calls the new `/api/scan` and `/api/devices/{address}/connect` endpoints.
* Optional startup automation via `CHIHIROS_AUTO_DISCOVER_ON_START=1` to perform a one-off scan and auto-connect on first run (no cached devices).

Deprecated
----------

* **CLI Tool (`chihirosctl`)**: Now designated as developer-only debugging tool. Direct BLE access will not be further developed or integrated with REST API. Use FastAPI service + SPA for production control.

Removed
-------

* Dropped legacy runtime import fallback (sys.path / importlib hack) from `service.py`.
* Removed transitional wrapper endpoints: `debug_live_status`, `set_doser_schedule`, `set_light_brightness` and archived `legacy_ui_archived`, `legacy_debug_archived` 410 routes. These paths now return 404.
* Removed legacy HTMX templates and unused empty `static/` directory (SPA + REST now primary interfaces).
* Removed the duplicate `chihiros_device_manager/api.py` module in favour of `core_api` to avoid package/module name collisions.

Changed
-------

* Tests now exercise the real FastAPI router HTTP endpoints using `TestClient` instead of calling wrapper functions directly.
* Extracted SPA serving & asset routing tests into dedicated `tests/test_spa.py` for clarity.
* Mocking strategy in tests disables BLE auto-reconnect and state-loading side effects to avoid hardware interaction during CI.

Internal
--------

* Cleaned unused imports and constants tied to removed wrapper logic.
* Normalised boolean environment variable parsing (`true/false`, `yes/no`, `on/off`, or `0/1`).

Fixed
-----

* Doser status parsing now tolerates a ±1 minute mismatch between the header time and the body’s leading time triplet, skipping preamble bytes when present to avoid mis-decoding head data.

---

Prior versions did not maintain a formal changelog; future changes will append here following Keep a Changelog style (Unreleased section, then dated releases).
