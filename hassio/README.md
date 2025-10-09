# Home Assistant Add-on: Aquarium Device Manager

Manage your Chihiros aquarium devices (dosers, lights) directly from Home Assistant via Bluetooth LE.

## Installation

### Method 1: Add-on Store (Future)
*Coming soon to the official Home Assistant Add-on Store*

### Method 2: Manual Installation

1. **Add custom repository:**
   - Go to **Supervisor** → **Add-on Store** → **⋮** → **Repositories**
   - Add: `https://github.com/caleb-venner/hassio-addons`

2. **Install the add-on:**
   - Find "Aquarium Device Manager" in the store
   - Click **Install**

### Method 3: Local Development

1. **Copy to add-ons directory:**
```bash
# On your HA system
cd /usr/share/hassio/addons/local/
git clone https://github.com/caleb-venner/aquarium-device-manager.git
# Copy hassio/ contents to a new addon directory
cp -r aquarium-device-manager/hassio/ aquarium-device-manager-addon/
```

2. **Reload add-ons:**
   - Go to **Supervisor** → **Add-on Store** → **⋮** → **Reload**

## Configuration

### Basic Configuration

```yaml
log_level: INFO
auto_discover: false
auto_reconnect: true
service_host: "0.0.0.0"
service_port: 8000
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `log_level` | string | `INFO` | Logging verbosity |
| `auto_discover` | boolean | `false` | Auto-discover devices on startup |
| `auto_reconnect` | boolean | `true` | Reconnect to cached devices |
| `service_host` | string | `0.0.0.0` | Service bind address |
| `service_port` | integer | `8000` | Web interface port |

### Log Levels
- `TRACE`: Extremely verbose debugging
- `DEBUG`: Detailed debugging information
- `INFO`: General information (recommended)
- `WARNING`: Warning messages only
- `ERROR`: Error messages only
- `CRITICAL`: Critical errors only

## Usage

1. **Start the add-on:**
   - Go to **Supervisor** → **Aquarium Device Manager**
   - Click **Start**

2. **Access web interface:**
   - Click **Open Web UI** in the add-on panel
   - Or visit `http://homeassistant.local:8000`

3. **Scan for devices:**
   - Use the "Scan for devices" button to discover nearby Chihiros devices
   - Connect to found devices to add them to your setup

## Integration with Home Assistant

### Future Entity Integration
*Planned features for deeper HA integration:*

- **Sensors:** Device status, battery levels, dosing schedules
- **Switches:** Light on/off, dosing pump controls
- **Lights:** Full WRGB light control entities
- **Automations:** Schedule-based device control

### Current Web Interface
The add-on provides a full web-based dashboard accessible through Home Assistant's interface.

## Bluetooth Requirements

### Prerequisites
- Home Assistant with Bluetooth support
- Compatible Bluetooth adapter (most built-in adapters work)
- Chihiros devices within Bluetooth range

### Troubleshooting Bluetooth

1. **Check Bluetooth status:**
```bash
# In HA terminal
bluetoothctl list
```

2. **Add-on logs:**
   - Check the add-on logs for Bluetooth connectivity issues
   - Look for "Bluetooth service is not available" warnings

3. **Device permissions:**
   - The add-on automatically requests Bluetooth access
   - No manual configuration should be needed

## Supported Devices

- Chihiros 4 Head Dosing Pump
- Chihiros LED A2
- Chihiros WRGB II (Regular, Pro, Slim)
- Chihiros Tiny Terrarium Egg
- Chihiros C II (RGB, White)
- Chihiros Universal WRGB
- Chihiros Z Light TINY

## Data Persistence

Device configurations and status are automatically saved to the add-on's data directory (`/data`), which persists across restarts and updates.

## Performance Considerations

- **Memory usage:** ~100-200MB depending on connected devices
- **CPU usage:** Low, with spikes during device scanning
- **Network:** Minimal, only local Bluetooth communication

## Support & Issues

- **Documentation:** [Full project documentation](https://github.com/caleb-venner/aquarium-device-manager)
- **Issues:** [GitHub Issues](https://github.com/caleb-venner/aquarium-device-manager/issues)
- **Discussions:** [GitHub Discussions](https://github.com/caleb-venner/aquarium-device-manager/discussions)

## Legal Notice

This add-on is not affiliated with, endorsed by, or approved by Chihiros Aquatic Studio or Shanghai Ogino Biotechnology Co.,Ltd. It is an independent, open-source project developed through reverse engineering.
