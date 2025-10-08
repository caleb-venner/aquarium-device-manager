"""Commander 1 device Model."""

from .light_device import LightDevice


class Commander1(LightDevice):
    """Chihiros Commander 1 device Class."""

    _model_name = "Commander 1"
    _model_codes = ["DYCOM"]
    _colors: dict[str, int] = {"white": 0, "red": 0, "green": 1, "blue": 2}
