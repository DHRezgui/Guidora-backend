FROM node:20-bookworm-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		python3 \
		python3-venv \
		python3-pip \
		build-essential \
		gcc \
		g++ \
		libgomp1 \
		netcat-openbsd \
	&& rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PYTHONUTF8=1

WORKDIR /app

# Build context is repository root (configured in docker-compose).
COPY backend/package*.json ./
RUN npm install --legacy-peer-deps

# Install runtime ML dependencies (includes lightgbm) to keep build time reasonable.
COPY ml/requirements.runtime.txt /tmp/ml-requirements.runtime.txt
RUN /opt/venv/bin/pip install --no-cache-dir --upgrade pip setuptools wheel \
	&& /opt/venv/bin/pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.5.1 \
	&& /opt/venv/bin/pip install --no-cache-dir -r /tmp/ml-requirements.runtime.txt

RUN /opt/venv/bin/python - <<'PY'
from sentence_transformers import SentenceTransformer

# Warm model cache during image build so first FAQ request does not block on download.
SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')
print('SentenceTransformer model cached')
PY

COPY backend/ ./
COPY ml/ /app/ml/

EXPOSE 3000

CMD ["npm", "run", "start"]