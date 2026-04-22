FROM node:22-bookworm-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		netcat-openbsd \
		curl \
		python3 \
		python3-venv \
		python3-pip \
		libgomp1 \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PYTHONUTF8=1

COPY backend/package*.json ./
RUN npm install

COPY ml/requirements.runtime.txt /tmp/requirements.txt
RUN /opt/venv/bin/pip install --no-cache-dir --upgrade pip setuptools wheel \
	&& /opt/venv/bin/pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.5.1 \
	&& /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt

RUN /opt/venv/bin/python - <<'PY'
from sentence_transformers import SentenceTransformer

SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')
print('SentenceTransformer model cached')
PY

COPY backend/. .
COPY ml ./ml

EXPOSE 3000
CMD ["npm", "run", "start:dev"]
