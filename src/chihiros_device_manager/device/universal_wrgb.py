"""Universal WRGB device Model."""

from .light_device import LightDevice


class UniversalWRGB(LightDevice):
    """Universal WRGB device Class."""

    _model_name = "Universal WRGB"
    _model_codes = [
        "DYU550",
        "DYU600",
        "DYU700",
        "DYU800",
        "DYU920",
        "DYU1000",
        "DYU1200",
        "DYU1500",
    ]
    _colors: dict[str, int] = {
        "red": 0,
        "green": 1,
        "blue": 2,
        "white": 3,
    }
