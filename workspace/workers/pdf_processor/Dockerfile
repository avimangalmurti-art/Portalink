FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY portalink_pdf_worker ./portalink_pdf_worker

RUN useradd --create-home --uid 10001 worker && chown -R worker:worker /app
USER worker

CMD ["python", "-m", "portalink_pdf_worker.main"]

