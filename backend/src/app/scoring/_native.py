from __future__ import annotations

import importlib
import importlib.machinery
import importlib.util
import sys
from pathlib import Path
from types import ModuleType

_NATIVE_MODULE = "scoring_native"


def load_native() -> ModuleType:
    """Import the compiled scoring_native module, falling back to local build artifacts."""
    try:
        return importlib.import_module(_NATIVE_MODULE)
    except ImportError as first_error:
        root = Path(__file__).resolve().parents[3]
        suffixes = list(importlib.machinery.EXTENSION_SUFFIXES)
        suffixes.extend([".so", ".dylib"])
        build_type = "release"
        base = root / "scoring" / "target" / build_type
        for suffix in suffixes:
            for stem in (_NATIVE_MODULE, f"lib{_NATIVE_MODULE}"):
                candidate = base / f"{stem}{suffix}"
                if not candidate.exists():
                    continue
                spec = importlib.util.spec_from_file_location(_NATIVE_MODULE, candidate)
                loader = spec.loader if spec else None
                if loader is None:
                    loader = importlib.machinery.ExtensionFileLoader(
                        _NATIVE_MODULE, str(candidate)
                    )
                    spec = importlib.util.spec_from_loader(_NATIVE_MODULE, loader)
                if spec and loader:
                    module = importlib.util.module_from_spec(spec)
                    try:
                        loader.exec_module(module)
                    except Exception as exc:
                        raise RuntimeError(
                            f"Failed to load native scoring module from {candidate!s}"
                        ) from exc
                    sys.modules[_NATIVE_MODULE] = module
                    return module
        raise RuntimeError(
            "scoring_native extension module not found. Run `cargo build` in ./scoring "
            "or install it with `maturin develop`."
        ) from first_error
