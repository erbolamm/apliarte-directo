FROM python:3.11-slim
WORKDIR /lab
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng && rm -rf /var/lib/apt/lists/*
RUN python -m pip install --no-cache-dir 'edge-tts>=7,<8' 'piper-tts>=1.4,<2'
COPY service.py index.html ./
RUN useradd --system --uid 10001 lab
USER lab
EXPOSE 8765
CMD ["python", "service.py"]
