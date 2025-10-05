FROM python:3.12-slim

ENV VIRTUAL_ENV=/opt/venv
RUN python -m venv $VIRTUAL_ENV && $VIRTUAL_ENV/bin/pip install --upgrade pip
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN python - <<'PY'
import importlib
mods = [
  "src.main",
  "src.app.app",
  "src.app.api.util",
]
for m in mods:
  try:
      importlib.import_module(m)
  except KeyError:  # missing env variable; expected during image build
      pass
print("imports seem to be working")
PY
