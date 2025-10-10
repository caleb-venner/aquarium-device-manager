# Current Iteration TODO

## Settings modal trigger

- When device --> settings window opened, a handshake with the device should occur to ensure actively connected and ready for commands/communication.

## Dashboard load

- When Overview dashboard is first loaded the frame hangs at:
    "
    🔄
    Loading dashboard data...
    "
  If no devices are connected or known then the current:
    "
    🔌
    No Devices Connected

    Get started by connecting your aquarium devices using the scan and connect options in the top navigation bar.

    💡
    Look for the "Scan" button in the top bar to discover nearby devices
    "
  should be shown, remove the icons though.

- The discovery frame can be removed completely from Overview tab.

## Overview tab

Device status indicator is currently overlapped with last update time indicator. We will move the time indicator to below the status indicator.
