Tools directory
===============

This folder contains small developer utilities used for debugging,
reverse-engineering, and manual testing of hardware (BLE) features.

Guidance:
- These scripts are developer tools only. They are not part of the
  production application nor are they executed by the automated test
  suite.
- Keep scripts here for convenience, document their usage, and avoid
  importing them from production code.

Files:

- `manual_doser_test.py` - ad-hoc script to manually program and inspect a
  dosing pump.
- `analyze_doser_log.py` - helper to decode PacketLogger RAW exports.
