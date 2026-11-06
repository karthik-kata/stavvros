from typing import Callable

_handlers: dict[str, list[Callable]] = {}


def subscribe(topic: str):
    """Register a handler for a Kafka topic."""
    def wrap(fn: Callable) -> Callable:
        _handlers.setdefault(topic, []).append(fn)
        return fn
    return wrap
