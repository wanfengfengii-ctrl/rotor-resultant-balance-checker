"""FastAPI 入口：十二孔离心转子偏载核验台。"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .models import ContributionOut, SuggestionOut, VerifyRequest, VerifyResponse
from .physics import (
    TOLERANCE_G,
    TubeLoad,
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
    )
