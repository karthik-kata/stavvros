"""Units shared by the detector and the mock model."""
from __future__ import annotations

from typing import Optional

UNITS = {  # unit -> (dimension, factor to base unit)
    "second": ("time", 1), "minute": ("time", 60), "hour": ("time", 3600), "day": ("time", 86400),
    "usd": ("money", 100), "cent": ("money", 1), "character": ("count", 1), "order": ("count", 1),
    "item": ("count", 1), "attempt": ("rate", 1), "per_minute": ("rate", 1),
}
NAME_UNITS = [  # constant-name suffix -> unit
    ("_PER_MINUTE", "per_minute"), ("_DAYS", "day"), ("_HOURS", "hour"), ("_MINUTES", "minute"),
    ("_SECONDS", "second"), ("_CENTS", "cent"), ("_LENGTH", "character"), ("_LIMIT", "order"),
]


def unit_of_constant(name: str) -> Optional[str]:
    return next((u for suf, u in NAME_UNITS if name.endswith(suf)), None)


def convert(amount: float, from_unit: str, to_unit: str) -> Optional[float]:
    a, b = UNITS.get(from_unit), UNITS.get(to_unit)
    if not a or not b or a[0] != b[0]:
        return None
    return amount * a[1] / b[1]


def fmt(amount: float, unit: str) -> str:
    a = int(amount) if float(amount).is_integer() else amount
    if unit == "usd":
        return f"${a:,}"
    if unit == "cent":
        return f"${a / 100:,.0f}" if a % 100 == 0 else f"{a} cents"
    if unit in ("per_minute", "attempt"):
        return f"{a} per minute"
    if unit == "order":
        return f"{a}"
    return f"{a} {unit}{'' if a == 1 else 's'}"
