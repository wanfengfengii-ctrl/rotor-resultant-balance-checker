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

# 可选工况参数范围
MIN_SPEED_RPM = 100
MAX_SPEED_RPM = 30000
MIN_RADIUS_MM = 10
MAX_RADIUS_MM = 500

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


def centrifugal_force_n(
    residual_g: float, speed_rpm: int, radius_mm: int
) -> float:
    """残余不平衡量在给定工况下产生的离心力（牛顿）。

        F = (R/1000) · (r/1000) · (2πn/60)²

    其中 R 为未舍入残余量（克），r 为转子有效半径（毫米），n 为转速（转/分）。
    离心力仅供操作员评估工况严重程度，不参与放行判定。
    """
    residual_kg = residual_g / 1000.0
    radius_m = radius_mm / 1000.0
    omega = 2.0 * math.pi * speed_rpm / 60.0
    return residual_kg * radius_m * omega * omega


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


@dataclass(frozen=True)
class OppositeDifference:
    """一对对置孔（k 与 k+6）的质量差诊断。

    delta_g = m_k − m_(k+6)（空孔按 0 克）；该有符号差值在 k 的固定角度上
    形成的矢量贡献为 (delta_g·cos θ_k, delta_g·sin θ_k)。六对贡献之和恒等于
    全体载荷的合成分量 (X, Y)，因为第 k+6 孔的方向恰为 θ_k+180°。
    """

    first_hole: int  # 0..5
    opposite_hole: int  # first_hole + 6
    first_mass_g: float
    opposite_mass_g: float
    delta_g: float
    x_g: float
    y_g: float


def compute_opposite_differences(
    loads: Iterable[TubeLoad],
) -> Tuple[OppositeDifference, ...]:
    """把 0–5 号孔与其对面的 6–11 号孔组成六对，计算有符号质量差及其分量贡献。

    按绝对差值从大到小排序，供拒绝面板优先展示“最值得复查”的对置孔；
    绝对差相同时以较小孔号（first_hole）升序稳定决胜。
    """
    masses = {load.hole: load.mass_g for load in loads}
    differences = []
    for first in range(HOLE_COUNT // 2):
        opposite = first + HOLE_COUNT // 2
        first_mass = masses.get(first, 0.0)
        opposite_mass = masses.get(opposite, 0.0)
        delta = first_mass - opposite_mass
        theta = math.radians(hole_angle_deg(first))
        differences.append(
            OppositeDifference(
                first_hole=first,
                opposite_hole=opposite,
                first_mass_g=first_mass,
                opposite_mass_g=opposite_mass,
                delta_g=delta,
                x_g=delta * math.cos(theta),
                y_g=delta * math.sin(theta),
            )
        )
    # 绝对差降序；并列时较小孔号升序
    differences.sort(key=lambda d: (-abs(d.delta_g), d.first_hole))
    return tuple(differences)


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
