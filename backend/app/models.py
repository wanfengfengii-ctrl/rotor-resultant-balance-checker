"""请求 / 响应模型。校验失败时由 Pydantic 输出逐字段 422 错误。"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from .physics import HOLE_COUNT


class Tube(BaseModel):
    """一支试管：孔位 0..11，整数质量 1..500 克。strict 模式拒绝非整数输入。"""

    model_config = ConfigDict(strict=True)

    hole: int
    mass_g: int

    @field_validator("hole")
    @classmethod
    def hole_in_range(cls, value: int) -> int:
        if not 0 <= value < HOLE_COUNT:
            raise ValueError(f"孔位必须在 0 至 {HOLE_COUNT - 1} 之间")
        return value

    @field_validator("mass_g")
    @classmethod
    def mass_in_range(cls, value: int) -> int:
        if not 1 <= value <= 500:
            raise ValueError("质量必须在 1 至 500 克之间")
        return value


class VerifyRequest(BaseModel):
    model_config = ConfigDict(strict=True)

    tubes: List[Tube]

    @field_validator("tubes")
    @classmethod
    def at_least_two_tubes(cls, value: List[Tube]) -> List[Tube]:
        if len(value) < 2:
            raise ValueError("至少需要两支试管")
        return value

    @model_validator(mode="after")
    def holes_must_be_unique(self) -> "VerifyRequest":
        holes = [tube.hole for tube in self.tubes]
        if len(set(holes)) != len(holes):
            raise ValueError("孔位重复：每个非空孔只能提交一次")
        return self


class ContributionOut(BaseModel):
    hole: int
    mass_g: float
    x_g: float
    y_g: float
    x_display: str
    y_display: str


class VerifyResponse(BaseModel):
    balanced: bool
    verdict: str  # “放行” 或 “拒绝”
    threshold_g: float
    residual_g: float
    residual_display: str
    direction_deg: Optional[float]
    direction_display: str  # 零残余量时为 “无”
    x_g: float
    y_g: float
    x_display: str
    y_display: str
    contributions: List[ContributionOut]
