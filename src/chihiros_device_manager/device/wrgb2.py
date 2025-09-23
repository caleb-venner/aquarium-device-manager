"""WRGB II device Model."""

from .light_device import LightDevice


class WRGBII(LightDevice):
    """Chihiros WRGB II device Class."""

    _model_name = "WRGB II"
    _model_codes = ["DYNWRGB", "DYNW30", "DYNW45", "DYNW60", "DYNW90", "DYNW12P"]
    _colors: dict[str, int] = {
        "red": 0,
        "green": 1,
        "blue": 2,
    }
