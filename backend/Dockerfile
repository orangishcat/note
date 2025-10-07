FROM python:3.12-slim

ENV VIRTUAL_ENV=/opt/venv
RUN python -m venv $VIRTUAL_ENV && $VIRTUAL_ENV/bin/pip install --upgrade pip
ENV PATH="$VIRTUAL_ENV/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PYTHONPATH=/app/src


# OS deps (libmagic etc.)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libmagic1 file \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1) Install base deps first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 2) Copy the project and install your package in EDITABLE mode
#    (requires pyproject.toml to declare setuptools/hatchling and src layout)
COPY . .
RUN pip install --no-cache-dir -e .

# 3) (Optional) Sanity check: load .env.test and import
RUN python - <<'PY'
from pathlib import Path
import os, importlib
try:
    from dotenv import load_dotenv
    env = Path("/app/.env.test")
    if env.exists():
        load_dotenv(env)
        print("Loaded .env.test")
    else:
        print("⚠️  .env.test not found")

    # After editable install, import via top-level package name:
    import app
    importlib.import_module("app")              # package
    print("✅ import app OK at", app.__file__)

    # If you have submodules:
    importlib.import_module("app.api.util")
    print("✅ import app.api.util OK")
except Exception as e:
    print("❌ Import check failed:", e)
    raise
PY
