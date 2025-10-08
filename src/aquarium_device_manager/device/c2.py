"""CII device Model."""

from .light_device import LightDevice


class CII(LightDevice):
    """Chihiros CII device Class."""

    _model_name = "C II"
    _model_codes = ["DYNC2N"]
    _colors: dict[str, int] = {
        "white": 0,
    }
