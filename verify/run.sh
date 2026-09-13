#!/usr/bin/env bash
# 一次性验收：pytest（计算 + API + 活服务联调）→ Vitest → Playwright。
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://backend:8000}"
FRONTEND_URL="${FRONTEND_URL:-http://frontend}"

echo "==> 等待后端就绪：${BACKEND_URL}"
python3 - <<'PY'
import os, time, urllib.request
url = os.environ.get("BACKEND_URL", "http://backend:8000") + "/api/health"
for attempt in range(60):
    try:
        with urllib.request.urlopen(url, timeout=2) as resp:
            if resp.status == 200:
                break
    except Exception:
        pass
    time.sleep(1)
else:
    raise SystemExit("后端未在 60 秒内就绪")
PY

echo "==> 等待前端就绪：${FRONTEND_URL}"
python3 - <<'PY'
import os, time, urllib.request
url = os.environ.get("FRONTEND_URL", "http://frontend")
for attempt in range(60):
    try:
        with urllib.request.urlopen(url, timeout=2) as resp:
            if resp.status == 200:
                break
    except Exception:
        pass
    time.sleep(1)
else:
    raise SystemExit("前端未在 60 秒内就绪")
PY

echo "==> [1/3] pytest：残余量计算、API 校验与活服务联调"
cd /verify/backend
RUN_INTEGRATION=1 BACKEND_URL="${BACKEND_URL}" python3 -m pytest -v

echo "==> [2/3] Vitest：前端载荷整理与错误映射"
cd /verify/frontend
npm run test:run

echo "==> [3/3] Playwright：端到端联调"
PLAYWRIGHT_BASE_URL="${FRONTEND_URL}" npx playwright test

echo "==> 全部验收通过"
