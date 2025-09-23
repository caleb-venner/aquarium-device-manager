"""Tiny Terraform egg device Model."""

from .light_device import LightDevice


class TinyTerrariumEgg(LightDevice):
    """Tiny Terraform egg device Class."""

    _model_name = "Tiny Terrarium Egg"
    _model_codes = ["DYDD"]
    _colors: dict[str, int] = {
        "red": 0,
        "green": 1,
    }
