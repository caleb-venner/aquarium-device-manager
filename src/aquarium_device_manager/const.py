"""BLE UART characteristic UUIDs used by Chihiros devices."""

from enum import Enum

UART_RX_CHAR_UUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
UART_TX_CHAR_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"


class DeviceType(Enum):
    """Device type enumeration for unified storage."""

    DOSER = "doser"
    LIGHT = "light"
