# Stage 1: install dependencies
FROM python:3.11-slim AS builder
WORKDIR /app

COPY pyproject.toml ./
COPY src/ ./src/
RUN pip install --no-cache-dir .

# Stage 2: runtime with baked-in models
FROM python:3.11-slim AS runtime
WORKDIR /app

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY src/ ./src/
COPY models/ ./models/

ENV PYTHONUNBUFFERED=1

EXPOSE 8100
CMD ["uvicorn", "src.sentinel_pdm.services.api:app", "--host", "0.0.0.0", "--port", "8100"]
