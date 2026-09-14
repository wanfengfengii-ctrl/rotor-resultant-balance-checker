"""FastAPI 入口：十二孔离心转子偏载核验台。"""

from __future__ import annotations

import json
import os
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute

from .models import (
    ContributionOut,
    ErrorAssessmentOut,
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
    compute_error_assessment,
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


class DecimalJsonRoute(APIRoute):
    """以 parse_float=Decimal 解析 JSON 请求体的路由。

    保留请求数值的原始小数位（0.500 不会塌缩为 0.5），使称量误差
    “最多两位小数”的校验能按调用方提交的字面量判定；校验流程、
    422 错误格式与 OpenAPI 文档仍完全由 FastAPI 原生机制产生。
    """

    def get_route_handler(self):
        original_handler = super().get_route_handler()

        async def handler(request: Request) -> Response:
            body = await request.body()

            async def json_decimal() -> Any:
                return json.loads(body, parse_float=Decimal)

            request.json = json_decimal  # type: ignore[method-assign]
            return await original_handler(request)

        return handler


router = APIRouter(route_class=DecimalJsonRoute)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@router.post("/api/verify", response_model=VerifyResponse)
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
    # 称量误差评估仅随填写了误差的请求返回：以未舍入残余量与有效试管数
    # 计算可信区间；省略误差时为 None，既有判定与调用方不受影响
    assessment_out = None
    if request.weighing_error_g is not None:
        assessment = compute_error_assessment(
            result.residual_g, len(loads), request.weighing_error_g
        )
        assessment_out = ErrorAssessmentOut(
            error_per_tube_g=assessment.error_per_tube_g,
            tube_count=assessment.tube_count,
            total_error_g=assessment.total_error_g,
            total_error_display=round2_display(assessment.total_error_g),
            lower_bound_g=assessment.lower_bound_g,
            lower_bound_display=round2_display(assessment.lower_bound_g),
            upper_bound_g=assessment.upper_bound_g,
            upper_bound_display=round2_display(assessment.upper_bound_g),
            kind=assessment.kind,
            label=assessment.label,
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
        condition=condition_out,
        opposite_differences=opposite_out,
        error_assessment=assessment_out,
    )


app.include_router(router)
