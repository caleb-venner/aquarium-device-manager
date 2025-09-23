"""Commander 4 device Model."""

from .light_device import LightDevice


class Commander4(LightDevice):
    """Chihiros Commander 4 device Class."""

    _model_name = "Commander 4"
    _model_codes = ["DYLED"]
    _colors: dict[str, int] = {"white": 0, "red": 0, "green": 1, "blue": 2}
