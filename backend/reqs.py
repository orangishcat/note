"""
Adds top-level dependencies from pyproject.toml and all given groups.
UV doesn't have a flag for top-level only, so here's a script to do it instead.
"""

import tomllib
from pathlib import Path

data = tomllib.loads(Path("pyproject.toml").read_text())
project = data.get("project", {})
deps = list(project.get("dependencies", []))

linux_glibc_wheel = (
    "scoring-native @ file:./wheels/"
    "scoring_native-0.1.0-cp38-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"
)

lines = [linux_glibc_wheel, *deps]

with open("requirements.txt", "w") as f:
    print("\n".join(lines), file=f)
