"""WRGB II Slim device Model."""

from .light_device import LightDevice


class WRGBIISlim(LightDevice):
    """Chihiros WRGB II Slim device Class."""

    _model_name = "WRGB II Slim"
    _model_codes = ["DYSILN"]
    _colors: dict[str, int] = {
        "red": 0,
        "green": 1,
        "blue": 2,
    }
