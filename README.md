# 十二孔离心转子偏载核验台

高速离心前的偏载核验：操作员录入 12 孔转子上各试管的整数克数，后端合成残余
不平衡量并给出唯一结论（放行 / 拒绝），前端展示每个非空孔的贡献、合成方向与结论。
核验被拒绝时，后端还会尝试给出一次加管即可放行的配平建议，操作员可一键应用后
重新核验。除偏载结论外，还可选填本次转速与转子有效半径，由未舍入残余量换算
离心力，帮助操作员避免相同残余量在高速工况下被低估。

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

## 配平建议（拒绝时）

核验结论为拒绝时，后端在同一计算链路中遍历**所有空孔 × 1–500 克整数质量**，
逐一用 `compute_resultant` 预测加入单支试管后的残余量：

- 以**预测残余量最小**为目标；差异低于 1e-9 视为并列，依次按**质量较小、
  孔号较小**稳定决胜（数学上相等的残余在浮点上可能有 ~1e-14 噪声，不能
  直接比较浮点值）。
- 仅当最优预测值**不超过 5.00 g** 时，建议才随响应的 `suggestion` 字段返回；
  没有空孔或所有候选仍超限时 `suggestion` 为 `null`。
- 预测与正式判定走同一条计算链路，应用建议后的核验结论与预测值一致。

前端在拒绝结果旁展示建议孔位、质量与预测残余量；点击「应用建议」把质量写入
对应空孔并清除旧结论，操作员再点击「核验」取得最终结论。无可行建议时页面明确
提示无法通过单支试管配平，并保留本次拒绝明细。

## 对置差异诊断（拒绝时）

为帮助操作员在被拒绝后快速定位最值得复查的孔对，后端在同一条质量矢量链路中
把 0–5 号孔分别与其对面的 6–11 号孔组成六对（k 与 k+6），对每对计算：

```
Δ_k = m_k − m_(k+6)                    ← 有符号差值（空孔按 0 克）
X_k = Δ_k · cos(30k°)
Y_k = Δ_k · sin(30k°)
```

- 六对贡献之和恒等于原合成分量：`Σ X_k = X`、`Σ Y_k = Y`
  （第 k+6 孔方向恰为 θ_k+180°，该恒等式是诊断正确性的核心校验）。
- 六对按**绝对差值从大到小**排序；绝对差相同时以**较小孔号**（0–5）升序
  稳定决胜，与差值正负无关。
- 诊断随拒绝响应的 `opposite_differences` 字段返回（六对完整结果），
  **放行时为 `null`，放行面板不展开诊断**。

拒绝结果面板只展示差异最大的**前三对**及其质量、有符号差值与 X、Y 贡献；
操作员点选某一对时，转子图**只高亮对应的两个孔位**（再次点选取消，点选另一对
切换高亮）。修改任一孔位或工况、应用配平建议或重新提交时，高亮与旧结果一起
清除；提交校验失败或网络失败时不保留诊断高亮，迟到响应仍按既有规则丢弃，
不会回填过期诊断。该字段为可选：旧版响应缺少该字段时页面仍正常显示结论。

## 可选工况与离心力

除偏载结论外，操作员可在录入区选填本次**转速 n（转/分钟，100–30000）**与
**转子有效半径 r（毫米，10–500）**。两项均留空时按原方式核验，响应不含工况结果；
两项填写完整后随核验请求一并提交，后端复用**未舍入残余量 R**计算离心力：

```
F (N) = (R / 1000) · (r / 1000) · (2πn / 60)²
```

- 结果面板把转速、有效半径与离心力（两位小数，ROUND_HALF_UP）展示在原结论旁；
  离心力仅供评估工况严重程度，**放行阈值、方向、贡献明细与配平建议仍完全由
  质量矢量链路决定**，工况不影响任何既有判定。
- 「应用建议」后工况输入原样保留，再次核验时继续参与换算。
- 只填一项、输入非整数或超出范围时，错误定位到对应的工况输入框，页面不展示
  旧结论或旧离心力（与孔位录入错误同规则）。

## 校验规则（API 强制）

- 每个非空孔只能提交一次：**重复孔位** → 422；
- 质量为 **1–500 克** 的整数（strict 模式，浮点/字符串一律拒绝）：越界 → 422；
- **至少两支试管**：不足 → 422；
- 空孔（未录入或 0 克）不提交，按 0 克处理；
- 工况参数（可选）：`condition.speed_rpm` 与 `condition.radius_mm` 必须**成对出现**
  （只给一项时缺失项 → 422 定位到该字段），均为 **100–30000 转/分钟** 与
  **10–500 毫米** 范围内的整数（strict 模式），越界 / 非整数 → 422 定位到对应字段；
  省略整个 `condition` 即按原方式核验。

422 响应为 Pydantic 逐字段错误（`detail[].loc` 定位到具体试管与字段，或
`["body", "condition", "speed_rpm" | "radius_mm"]` 定位到工况输入），前端把
错误映射回对应孔位输入框或工况输入框；无法定位的错误（重复孔位、数量不足）
显示为通用错误。**修改任何孔位或工况输入后立即清除旧结论；校验失败只显示错误，
绝不沿用上一次放行结果。**

核验请求在飞行途中时，任何录入修改（含清空、应用建议）都会使该次请求作废：
迟到的响应——无论结论、配平建议还是 422 校验错误——一律丢弃，页面保持清空，
等待按当前载荷重新核验；建议目标孔已被占用时旧建议失效，不得覆盖当前录入。

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
{
  "tubes": [ { "hole": 0, "mass_g": 100 }, { "hole": 6, "mass_g": 90 } ],
  "condition": { "speed_rpm": 3000, "radius_mm": 100 }
}
```

`condition` 可整体省略（或两项都不填的等价前端行为），此时响应 `condition`
为 `null`，其余字段与既有调用完全一致。

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
  ],
  "suggestion": null,
  "condition": {
    "speed_rpm": 3000,
    "radius_mm": 100,
    "centrifugal_force_n": 98.69604401089359,
    "centrifugal_force_display": "98.70"
  }
}
```

- `*_g` / `direction_deg` 为未舍入原始值；`*_display` 为两位小数十进制四舍五入
  字符串；零残余量时 `direction_deg = null`、`direction_display = "无"`。
- `contributions` 按提交顺序列出每个非空孔对 X、Y 分量的贡献。
- `suggestion` 为可空字段（兼容既有调用方）：仅「拒绝且存在一次加管即可放行
  的候选」时非空，形如
  `{ "hole": 9, "mass_g": 10, "predicted_residual_g": 0.0, "predicted_residual_display": "0.00" }`；
  放行、没有空孔或所有候选仍超限时应答为 `null`。
- `condition` 为可空字段（兼容既有调用方）：仅请求带完整工况时非空，
  `centrifugal_force_n` 为按 `F = (R/1000)(r/1000)(2πn/60)²`、基于未舍入
  残余量 `residual_g` 计算的牛顿值，`centrifugal_force_display` 为其两位小数
  展示值；省略工况时应答为 `null`。离心力不参与放行判定。
- `opposite_differences` 为可空字段（兼容旧版调用方）：仅拒绝时给出六对
  对置孔诊断（放行时为 `null`，旧版响应缺省时前端只显示结论），按绝对差值
  降序、并列时较小孔号升序排列，每条形如
  `{ "first_hole": 0, "opposite_hole": 6, "first_mass_g": 100.0,
  "opposite_mass_g": 90.0, "delta_g": 10.0, "delta_display": "10.00",
  "x_g": 10.0, "y_g": 0.0, "x_display": "10.00", "y_display": "0.00" }`；
  `delta_g = first_mass_g − opposite_mass_g` 为有符号差值，六对 `x_g` /
  `y_g` 之和分别等于响应的 `x_g` / `y_g`。面板只展示其中前三对。
- 校验失败返回 422，`detail` 为逐字段错误列表，工况错误的 `loc` 形如
  `["body", "condition", "speed_rpm"]` / `["body", "condition", "radius_mm"]`。

`GET /api/health` → `{ "status": "ok" }`

## 目录结构

```
backend/            FastAPI 应用
  app/physics.py    残余量、方向、舍入与配平建议（唯一计算实现）
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
