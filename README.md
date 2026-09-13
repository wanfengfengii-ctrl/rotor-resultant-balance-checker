# 十二孔离心转子偏载核验台

高速离心前的偏载核验：操作员录入 12 孔转子上各试管的整数克数，后端合成残余
不平衡量并给出唯一结论（放行 / 拒绝），前端展示每个非空孔的贡献、合成方向与结论。

## 计算公式与判定规则

孔位 `k`（0–11）的固定角度为 `30k` 度（数学约定：+X 轴为 0°，逆时针为正）。
对每个非空孔累加质量矢量：

```
X = Σ m_k · cos(30k°)
Y = Σ m_k · sin(30k°)
R = √(X² + Y²)          ← 残余量（克）
θ = atan2(Y, X) mod 360° ← 合成方向，归一到 [0°, 360°)
```

- **判定使用未舍入值**：`R ≤ 5.00 g` 放行，否则拒绝。
- **展示值**采用十进制四舍五入（ROUND_HALF_UP）保留两位小数；判定不受影响
  （例如 R = 4.996 显示为 `5.00`，仍放行）。
- **零残余量**（R = 0）时方向显示「无」；理论上为零的合成分量会带 ~1e-16 的
  浮点噪声，低于 1e-9 即按精确的 0 处理，保证该判定稳定。
- 方向展示值同样落在 `[0°, 360°)`：归一化后的 359.995…° 舍入会得到 360.00，
  展示层再次归一为 `0.00`。
- 页面按顺时针展示孔位（0 号孔在正上方，编号顺时针递增）；为与画面一致，
  合成矢量箭头按 `(X, Y) → (Y, −X)` 映射绘制，方向角数值仍按上述数学约定报告。

## 校验规则（API 强制）

- 每个非空孔只能提交一次：**重复孔位** → 422；
- 质量为 **1–500 克** 的整数（strict 模式，浮点/字符串一律拒绝）：越界 → 422；
- **至少两支试管**：不足 → 422；
- 空孔（未录入或 0 克）不提交，按 0 克处理。

422 响应为 Pydantic 逐字段错误（`detail[].loc` 定位到具体试管与字段），前端把
错误映射回对应孔位输入框；无法定位的错误（重复孔位、数量不足）显示为通用错误。
**修改任何孔位后立即清除旧结论；校验失败只显示错误，绝不沿用上一次放行结果。**

## 快速开始（Docker Compose）

```bash
docker compose up --build          # 前端默认 http://localhost:5173
WEB_PORT=8080 docker compose up    # 宿主端口由 WEB_PORT 覆盖
```

- `frontend`：nginx 托管静态文件，并将 `/api` 反向代理到 `backend`；
- `backend`：FastAPI + uvicorn，容器内 8000 端口。

### 一次性验收

`verify` 服务在依赖就绪后依次运行 pytest（计算 + API + 活服务联调）、
Vitest（前端单元测试）、Playwright（端到端联调），全部通过后退出：

```bash
docker compose up --build --exit-code-from verify
# 或
docker compose run --rm verify
```

退出码为 0 即验收通过。

## 本地开发

```bash
# 后端（Python 3.11+）
cd backend
pip install -r requirements-dev.txt
uvicorn app.main:app --reload        # http://localhost:8000

# 前端（Node 20+）
cd frontend
npm ci
npm run dev                          # http://localhost:5173，/api 代理到 8000
```

### 运行测试

```bash
# 后端：单元 + API（TestClient）
cd backend && pytest

# 后端：活服务联调（需后端已启动）
cd backend && RUN_INTEGRATION=1 BACKEND_URL=http://localhost:8000 pytest

# 前端：Vitest
cd frontend && npm run test:run

# 前端：Playwright（需后端已启动；自动拉起 Vite 开发服务器）
cd frontend && npx playwright install chromium && npm run e2e
# 或指向已运行的部署：
cd frontend && PLAYWRIGHT_BASE_URL=http://localhost:5173 npx playwright test
```

## API 契约

`POST /api/verify`

```json
{ "tubes": [ { "hole": 0, "mass_g": 100 }, { "hole": 6, "mass_g": 90 } ] }
```

200 响应（节选）：

```json
{
  "balanced": false,
  "verdict": "拒绝",
  "threshold_g": 5.0,
  "residual_g": 10.0,
  "residual_display": "10.00",
  "direction_deg": 0.0,
  "direction_display": "0.00",
  "x_g": 10.0, "y_g": 0.0,
  "x_display": "10.00", "y_display": "0.00",
  "contributions": [
    { "hole": 0, "mass_g": 100, "x_g": 100.0, "y_g": 0.0,
      "x_display": "100.00", "y_display": "0.00" },
    { "hole": 6, "mass_g": 90, "x_g": -90.0, "y_g": 1.1e-14,
      "x_display": "-90.00", "y_display": "0.00" }
  ]
}
```

- `*_g` / `direction_deg` 为未舍入原始值；`*_display` 为两位小数十进制四舍五入
  字符串；零残余量时 `direction_deg = null`、`direction_display = "无"`。
- `contributions` 按提交顺序列出每个非空孔对 X、Y 分量的贡献。
- 校验失败返回 422，`detail` 为逐字段错误列表。

`GET /api/health` → `{ "status": "ok" }`

## 目录结构

```
backend/            FastAPI 应用
  app/physics.py    残余量、方向、舍入（唯一计算实现）
  app/models.py     Pydantic 请求/响应与校验规则
  app/main.py       路由与 CORS
  tests/            pytest：计算、API、活服务联调
frontend/           React + Vite + TypeScript
  src/lib/          载荷整理、422 错误映射（Vitest 覆盖）
  src/components/   转子视图（顺时针 12 孔 + 合成箭头）、结果面板
  e2e/              Playwright 端到端
verify/             一次性验收服务（pytest + Vitest + Playwright）
docker-compose.yml  backend / frontend（WEB_PORT 覆盖宿主端口）/ verify
```
