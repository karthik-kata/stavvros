import shutil
from pathlib import Path

import pytest

from stavvros_drift.container import Settings, build_container

ACME = Path(__file__).resolve().parents[2] / "acme-shop"


@pytest.fixture()
def container(tmp_path):
    code = tmp_path / "acme-shop"
    shutil.copytree(ACME, code, ignore=shutil.ignore_patterns("__pycache__"))
    return build_container(Settings(codebase=code, data_dir=tmp_path / "data", cache_llm=False))
