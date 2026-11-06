import os

DEFAULT_WORKSPACE = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "stavvros-workspace")
)

WORKSPACE_PATH = os.environ.get("STAVVROS_WORKSPACE_PATH", DEFAULT_WORKSPACE)

def get_workspace_name() -> str:
    return os.path.basename(os.path.normpath(WORKSPACE_PATH))

def get_workspace_path() -> str:
    return WORKSPACE_PATH
