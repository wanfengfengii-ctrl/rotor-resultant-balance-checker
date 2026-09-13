"""十二孔离心转子残余偏载（不平衡量）计算。

物理约定
--------
- 孔位 k（0..11）的固定角度为 30k 度（数学约定：+X 轴为 0°，逆时针为正）。
- 逐孔累加质量矢量：
      X = Σ m_k · cos(30k°)
      Y = Σ m_k · sin(30k°)
- 残余量 R = sqrt(X² + Y²)。
- 判定使用未舍入值：R <= 5.00 g 放行，否则拒绝。
- 展示值采用十进制四舍五入（ROUND_HALF_UP）保留两位。
- 方向角 = atan2(Y, X)，归一到 [0°, 360°)；零残余量时方向为 None（前端显示“无”）。

浮点处理
--------
理论上应为零的合成分量（例如对置等质量）会因 cos/sin 的浮点误差留下
~1e-16 量级的噪声。低于 _ZERO_EPS 的分量被视为精确的 0，以保证
“零残余量 ⇒ 方向：无”这一判定稳定可复现。
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable, Optional, Tuple

HOLE_COUNT = 12
ANGLE_STEP_DEG = 30.0
TOLERANCE_G = 5.0

MIN_MASS_G = 1
MAX_MASS_G = 500

_ZERO_EPS = 1e-9

# 两个候选的预测残余量差异低于该值时视为并列，按质量较小、孔号较小决胜。
# 数学上相等的残余在浮点上可能有 ~1e-14 的噪声（例如 cos(30°) 与 |cos(150°)|
# 的最后一位不同），若按浮点精确比较会让噪声代替决胜规则。
_TIE_EPS = 1e-9


def round2_display(value: float) -> str:
    """十进制四舍五入保留两位小数，返回字符串；消除 “-0.00”。"""
    quantized = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if quantized == 0:
        quantized = Decimal("0.00")
    return format(quantized, "f")


def direction_display(direction_deg: float) -> str:
    """方向角展示值：两位小数，且仍落在 [0°, 360°) 内。

    归一化后的方向可能为 359.995…°，四舍五入得到 360.00，须再次归一为 0.00。
    """
    quantized = Decimal(str(direction_deg)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    ) % Decimal("360.00")
    if quantized == 0:
        quantized = Decimal("0.00")
    return format(quantized, "f")


def hole_angle_deg(hole: int) -> float:
    """孔位 k 的固定角度：30k 度。"""
    return ANGLE_STEP_DEG * hole


@dataclass(frozen=True)
class TubeLoad:
    hole: int
    mass_g: float


@dataclass(frozen=True)
class Contribution:
    """单个非空孔对 X、Y 分量的贡献。"""

    hole: int
    mass_g: float
    x_g: float
    y_g: float


@dataclass(frozen=True)
class RotorResult:
    x_g: float
    y_g: float
    residual_g: float
    direction_deg: Optional[float]  # None 表示零残余量（方向：无）
    balanced: bool
    contributions: Tuple[Contribution, ...]


def compute_resultant(loads: Iterable[TubeLoad]) -> RotorResult:
    """合成所有试管的质量矢量并给出判定结果（判定用未舍入值）。"""
    x = 0.0
    y = 0.0
    contributions = []
    for load in loads:
        theta = math.radians(hole_angle_deg(load.hole))
        cx = load.mass_g * math.cos(theta)
        cy = load.mass_g * math.sin(theta)
        x += cx
        y += cy
        contributions.append(
            Contribution(hole=load.hole, mass_g=load.mass_g, x_g=cx, y_g=cy)
        )

    # 消除浮点噪声，保证零残余量判定稳定
    if abs(x) < _ZERO_EPS:
        x = 0.0
    if abs(y) < _ZERO_EPS:
        y = 0.0

    residual = math.hypot(x, y)
    if residual < _ZERO_EPS:
        residual = 0.0

    if residual == 0.0:
        direction: Optional[float] = None
    else:
        direction = math.degrees(math.atan2(y, x)) % 360.0

    return RotorResult(
        x_g=x,
        y_g=y,
        residual_g=residual,
        direction_deg=direction,
        balanced=residual <= TOLERANCE_G,
        contributions=tuple(contributions),
    )


@dataclass(frozen=True)
class BalanceSuggestion:
    """单支试管配平建议：向空孔 hole 加入 mass_g 克后的预测残余量。"""

    hole: int
    mass_g: int
    predicted_residual_g: float


def _is_better_candidate(
    predicted: float, mass_g: int, hole: int, best: BalanceSuggestion
) -> bool:
    """候选是否优于当前最优：残余量更小；并列时质量较小、孔号较小者优先。"""
    if predicted < best.predicted_residual_g - _TIE_EPS:
        return True
    if predicted <= best.predicted_residual_g + _TIE_EPS:
        return (mass_g, hole) < (best.mass_g, best.hole)
    return False


def suggest_balance(loads: Iterable[TubeLoad]) -> Optional[BalanceSuggestion]:
    """为被拒绝的载荷寻找一次加管即可放行的配平建议。

    遍历所有空孔与 1–500 克整数质量，复用 compute_resultant 计算预测残余量
    （与正式判定同一条计算链路，保证应用建议后的核验结论与预测一致）。
    以预测残余量最小为目标，按质量较小、孔号较小的顺序稳定决胜。
    仅当最优预测值不超过放行阈值时返回建议；没有空孔或所有候选仍超限
    时返回 None（无法通过单支试管配平）。
    """
    loads = list(loads)
    occupied = {load.hole for load in loads}
    best: Optional[BalanceSuggestion] = None
    for hole in range(HOLE_COUNT):
        if hole in occupied:
            continue
        for mass_g in range(MIN_MASS_G, MAX_MASS_G + 1):
            predicted = compute_resultant(
                [*loads, TubeLoad(hole=hole, mass_g=mass_g)]
            ).residual_g
            if best is None or _is_better_candidate(predicted, mass_g, hole, best):
                best = BalanceSuggestion(
                    hole=hole, mass_g=mass_g, predicted_residual_g=predicted
                )
    if best is None or best.predicted_residual_g > TOLERANCE_G:
        return None
    return best
