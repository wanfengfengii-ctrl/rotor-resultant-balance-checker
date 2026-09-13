"""FastAPI 入口：十二孔离心转子偏载核验台。"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    ContributionOut,
    OperatingConditionOut,
    OppositeDifferenceOut,
    SuggestionOut,
    VerifyRequest,
    VerifyResponse,
)
from .physics import (
    TOLERANCE_G,
    TubeLoad,
    centrifugal_force_n,
    compute_opposite_differences,
    compute_resultant,
    direction_display,
    round2_display,
    suggest_balance,
)

app = FastAPI(title="十二孔离心转子偏载核验台", version="1.0.0")

_cors_origins = os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in _cors_origins if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/verify", response_model=VerifyResponse)
def verify(request: VerifyRequest) -> VerifyResponse:
    loads = [TubeLoad(hole=t.hole, mass_g=t.mass_g) for t in request.tubes]
    result = compute_resultant(loads)
    # 仅在拒绝时计算配平建议；无可行建议（无空孔或候选均超限）时为 None
    suggestion = None
    if not result.balanced:
        found = suggest_balance(loads)
        if found is not None:
            suggestion = SuggestionOut(
                hole=found.hole,
                mass_g=found.mass_g,
                predicted_residual_g=found.predicted_residual_g,
                predicted_residual_display=round2_display(found.predicted_residual_g),
            )
    # 工况参数成对给出时，复用未舍入残余量计算离心力；省略工况时为 None
    condition_out = None
    if request.condition is not None:
        force_n = centrifugal_force_n(
            result.residual_g,
            request.condition.speed_rpm,
            request.condition.radius_mm,
        )
        condition_out = OperatingConditionOut(
            speed_rpm=request.condition.speed_rpm,
            radius_mm=request.condition.radius_mm,
            centrifugal_force_n=force_n,
            centrifugal_force_display=round2_display(force_n),
        )
    # 对置差异诊断仅随拒绝结果返回：放行面板不展开诊断
    opposite_out = None
    if not result.balanced:
        opposite_out = [
            OppositeDifferenceOut(
                first_hole=d.first_hole,
                opposite_hole=d.opposite_hole,
                first_mass_g=d.first_mass_g,
                opposite_mass_g=d.opposite_mass_g,
                delta_g=d.delta_g,
                delta_display=round2_display(d.delta_g),
                x_g=d.x_g,
                y_g=d.y_g,
                x_display=round2_display(d.x_g),
                y_display=round2_display(d.y_g),
            )
            for d in compute_opposite_differences(loads)
        ]
    return VerifyResponse(
        balanced=result.balanced,
        verdict="放行" if result.balanced else "拒绝",
        threshold_g=TOLERANCE_G,
        residual_g=result.residual_g,
        residual_display=round2_display(result.residual_g),
        direction_deg=result.direction_deg,
        direction_display=(
            "无" if result.direction_deg is None else direction_display(result.direction_deg)
        ),
        x_g=result.x_g,
        y_g=result.y_g,
        x_display=round2_display(result.x_g),
        y_display=round2_display(result.y_g),
        contributions=[
            ContributionOut(
                hole=c.hole,
                mass_g=c.mass_g,
                x_g=c.x_g,
                y_g=c.y_g,
                x_display=round2_display(c.x_g),
                y_display=round2_display(c.y_g),
            )
            for c in result.contributions
        ],
        suggestion=suggestion,
        condition=condition_out,
        opposite_differences=opposite_out,
    )
