FROM python:3.12-slim

ENV VIRTUAL_ENV=/opt/venv
RUN python -m venv $VIRTUAL_ENV && $VIRTUAL_ENV/bin/pip install --upgrade pip
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
