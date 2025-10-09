# Aquarium Device Controller TODO -

- Implement counter —> 1/1; 2/3 etc for doses completed today.
- Real time light values - need to be implemented from saved config data.
- What are we exposing as devices, entities, helpers, attributes?

## General -

- Device config/state/setting file needs to maintain its current state whilst allowing partial updates through command execution and/or status updates.
  - Do we need revision/ previous states saved?
- Between Overview and Devices tabs, for all devices, ensure ‘Refresh’ button triggers same function, it should not interupt regular navigation or UX. No pop-up window or hard page refresh. This refresh should request a new status payload.
- Refresh All in top bar. Should trigger refresh for all connected devices (the same result as clicking on refresh for each device)
- Below device information section (ie. Model …) No Configuration should become “No Saved Settings” (for all devices, light and doser).

## Doser -

- Metadata config correctly loaded from file for overview, not pre-populated in configure window Devices tab.
  - metadata should be preloaded into device configure page if present.
- Overview tab it correctly shows the active heads as active and what mode they are set to.
So individual heads when selected should pre populate with this data.

## Light -

- ‘Max Brightness’ is not a real value, need to send brightness data for each channel. So WRGB 2 Pro is R,G,B,W
- Need ‘Clear Auto Settings?’
- Set Manual Mode
- Need to figure out the Custom Mode. I think it just creates a bunch of auto mode settings; the device itself must compute how they all interact.
- Ensure Auto settings do not overlap. One can end at at 21:00 with another starting at 21:00; cannot have end 21:01 start 21:00.
