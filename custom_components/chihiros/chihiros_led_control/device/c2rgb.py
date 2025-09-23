"""CII RGB device Model."""

from .light_device import LightDevice


class CIIRGB(LightDevice):
    """Chihiros CII RGB device Class."""

    _model_name = "C II RGB"
    _model_codes = ["DYNCRGP"]
    _colors: dict[str, int] = {
        "red": 0,
        "green": 1,
        "blue": 2,
    }
