"""Thin wrapper over the Kafka producer."""
from typing import Any


def publish(topic: str, payload: dict[str, Any]) -> None:
    """Publish an event. Topics are namespaced by service."""
    ...  # producer.send(topic, payload)
