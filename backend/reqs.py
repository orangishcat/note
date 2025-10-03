"""
Adds top-level dependencies from pyproject.toml and all given groups.
UV doesn't have a flag for top-level only, so here's a script to do it instead.
"""

import tomllib
from pathlib import Path

data = tomllib.loads(Path("pyproject.toml").read_text())
project = data.get("project", {})
deps = list(project.get("dependencies", []))

linux_x86_wheel = (
    "scoring-native @ file:./wheels/"
    "scoring_native-0.1.0-cp38-abi3-musllinux_1_2_x86_64.whl"
    " ; platform_system == 'Linux' and platform_machine == 'x86_64'"
)

darwin_arm_wheel = (
    "scoring-native @ file:./wheels/"
    "scoring_native-0.1.0-cp38-abi3-macosx_11_0_arm64.whl"
    " ; platform_system == 'Darwin' and "
    "(platform_machine == 'arm64' or platform_machine == 'aarch64')"
)

fallback_line = "scoring-native==0.1.0"

lines = [linux_x86_wheel, darwin_arm_wheel, fallback_line, *deps]

with open("requirements.txt", "w") as f:
    print("\n".join(lines), file=f)
