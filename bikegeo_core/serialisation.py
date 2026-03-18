from __future__ import annotations

import base64
import binascii
import json
import zlib
from typing import Any, Dict

from pydantic import ValidationError

from .models import SCHEMA_VERSION, SetupInput, SetupOutput


def setup_input_from_dict(data: Dict[str, Any]) -> SetupInput:
    return SetupInput(**data)


def setup_output_from_dict(data: Dict[str, Any]) -> SetupOutput:
    return SetupOutput(**data)


def setup_input_to_dict(setup: SetupInput) -> Dict[str, Any]:
    return setup.model_dump()


def setup_output_to_dict(setup: SetupOutput) -> Dict[str, Any]:
    return setup.model_dump()


def encode_setup_to_fragment(setup: SetupInput) -> str:
    raw = json.dumps(setup_input_to_dict(setup)).encode("utf-8")
    compressed = zlib.compress(raw)
    return base64.urlsafe_b64encode(compressed).decode("ascii")


def decode_setup_from_fragment(fragment: str) -> SetupInput:
    try:
        compressed = base64.urlsafe_b64decode(fragment.encode("ascii"))
        raw = zlib.decompress(compressed)
        data = json.loads(raw.decode("utf-8"))
        if "schema_version" not in data:
            data["schema_version"] = SCHEMA_VERSION
        return setup_input_from_dict(data)
    except (binascii.Error, zlib.error, UnicodeDecodeError, json.JSONDecodeError, ValidationError) as exc:
        raise ValueError(f"Invalid or corrupted setup fragment: {exc}") from exc
