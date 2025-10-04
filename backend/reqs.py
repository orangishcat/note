"""
Adds top-level dependencies from pyproject.toml and all given groups.
UV doesn't have a flag for top-level only, so here's a script to do it instead.
"""

import tomllib
from pathlib import Path

data = tomllib.loads(Path("pyproject.toml").read_text())
project = data.get("project", {})
deps = list(project.get("dependencies", []))

lines = ["note-scoring>=0.1.0", *deps]

with open("requirements.txt", "w") as f:
    print("\n".join(lines), file=f)
