# 一次性验收服务：依次运行 pytest、Vitest、Playwright。
# 基础镜像与 frontend 的 @playwright/test 版本保持一致，自带浏览器与 Node。
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /verify

# Python 用于 pytest（后端单元 / API / 联调测试）
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# 后端依赖（TestClient 需要 fastapi；联调测试需要 httpx2）
COPY backend/requirements.txt backend/requirements-dev.txt backend/
RUN pip3 install --no-cache-dir --break-system-packages \
    -r backend/requirements-dev.txt

# 前端依赖（vitest、playwright）
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci --no-audit --no-fund

# 源码与测试
COPY backend/ backend/
COPY frontend/ frontend/
COPY verify/run.sh run.sh

ENV BACKEND_URL=http://backend:8000 \
    FRONTEND_URL=http://frontend

CMD ["bash", "run.sh"]
