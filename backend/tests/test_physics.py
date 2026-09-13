"""compute_resultant 与 round2_display 的单元测试。"""

import math

import pytest

from app.physics import (
    TOLERANCE_G,
    TubeLoad,
    centrifugal_force_n,
    compute_resultant,
    direction_display,
    hole_angle_deg,
    round2_display,
    suggest_balance,
)


def loads(*pairs):
    return [TubeLoad(hole=k, mass_g=m) for k, m in pairs]


class TestHoleAngle:
    def test_angle_is_30k_degrees(self):
        assert hole_angle_deg(0) == 0.0
        assert hole_angle_deg(1) == 30.0
        assert hole_angle_deg(11) == 330.0


class TestResidual:
    def test_opposite_equal_masses_cancel_to_zero(self):
        result = compute_resultant(loads((0, 100), (6, 100)))
        assert result.residual_g == 0.0
        assert result.x_g == 0.0
        assert result.y_g == 0.0
        assert result.balanced is True
        assert result.direction_deg is None

    def test_vertical_pair_cancels(self):
        result = compute_resultant(loads((3, 50), (9, 50)))
        assert result.residual_g == 0.0
        assert result.direction_deg is None

    def test_threefold_symmetry_cancels(self):
        result = compute_resultant(loads((0, 80), (4, 80), (8, 80)))
        assert result.residual_g == 0.0
        assert result.balanced is True
        assert result.direction_deg is None

    def test_imbalance_along_x(self):
        result = compute_resultant(loads((0, 100), (6, 90)))
        assert result.residual_g == pytest.approx(10.0)
        assert result.balanced is False
        assert result.direction_deg == pytest.approx(0.0)

    def test_boundary_exactly_5g_passes(self):
        result = compute_resultant(loads((0, 105), (6, 100)))
        assert result.residual_g == pytest.approx(TOLERANCE_G)
        assert result.balanced is True

    def test_just_above_5g_rejected(self):
        result = compute_resultant(loads((0, 105.0000001), (6, 100)))
        assert result.residual_g > TOLERANCE_G
        assert result.balanced is False

    def test_judgement_uses_unrounded_value(self):
        # 残余 4.996…（显示为 5.00）仍应放行：判定不得使用舍入值
        result = compute_resultant(loads((0, 104.996), (6, 100)))
        assert round2_display(result.residual_g) == "5.00"
        assert result.balanced is True

    def test_resultant_of_perpendicular_pair(self):
        result = compute_resultant(loads((0, 100), (3, 100)))
        assert result.residual_g == pytest.approx(math.sqrt(2) * 100)
        assert result.direction_deg == pytest.approx(45.0)
        assert result.balanced is False


class TestDirection:
    def test_negative_x_points_to_180(self):
        result = compute_resultant(loads((0, 50), (6, 100)))
        assert result.direction_deg == pytest.approx(180.0)

    def test_negative_y_normalized_to_270_not_minus_90(self):
        result = compute_resultant(loads((3, 10), (9, 50)))
        assert result.direction_deg == pytest.approx(270.0)

    def test_direction_range_is_0_inclusive_360_exclusive(self):
        for k in range(12):
            result = compute_resultant(loads((k, 10), ((k + 6) % 12, 5)))
            assert 0.0 <= result.direction_deg < 360.0

    def test_arbitrary_direction(self):
        # 孔 1（30°）方向上的净残余
        result = compute_resultant(loads((1, 100), (7, 60)))
        assert result.direction_deg == pytest.approx(30.0)
        assert result.residual_g == pytest.approx(40.0)


class TestContributions:
    def test_each_nonempty_hole_reported_once(self):
        result = compute_resultant(loads((0, 100), (1, 50), (6, 100)))
        assert [c.hole for c in result.contributions] == [0, 1, 6]

    def test_contribution_components(self):
        result = compute_resultant(loads((1, 100), (5, 200)))
        c1, c5 = result.contributions
        assert c1.x_g == pytest.approx(100 * math.cos(math.radians(30)))
        assert c1.y_g == pytest.approx(100 * math.sin(math.radians(30)))
        assert c5.x_g == pytest.approx(200 * math.cos(math.radians(150)))
        assert c5.y_g == pytest.approx(200 * math.sin(math.radians(150)))
        assert result.x_g == pytest.approx(c1.x_g + c5.x_g)
        assert result.y_g == pytest.approx(c1.y_g + c5.y_g)


class TestDirectionDisplay:
    def test_rounded_360_renormalized_to_0(self):
        # 实测用例：净方向略偏负 Y，atan2 ≈ -0.005°，归一化 359.995…°，
        # 两位小数舍入为 360.00，展示层必须再次归一为 0.00
        result = compute_resultant(loads((10, 26), (9, 81), (1, 207)))
        assert 0.0 <= result.direction_deg < 360.0
        assert result.direction_deg == pytest.approx(359.995, abs=1e-3)
        assert direction_display(result.direction_deg) == "0.00"

    @pytest.mark.parametrize(
        "value,expected",
        [
            (0.0, "0.00"),
            (45.0, "45.00"),
            (359.994, "359.99"),
            (359.995, "0.00"),
            (359.999999, "0.00"),
            (180.0, "180.00"),
            (270.0, "270.00"),
        ],
    )
    def test_display_stays_in_0_to_360_exclusive(self, value, expected):
        assert direction_display(value) == expected


class TestSuggestBalance:
    def test_unique_optimal_suggestion(self):
        # 残余 10 g 沿 +Y（孔 3 方向），唯一能在对置孔 9 加 10 g 精确抵消
        suggestion = suggest_balance(loads((0, 100), (6, 100), (3, 10)))
        assert suggestion is not None
        assert suggestion.hole == 9
        assert suggestion.mass_g == 10
        assert suggestion.predicted_residual_g == 0.0

    def test_tie_broken_by_smaller_hole(self):
        # 孔 8 与孔 9 各加 14 g 的预测残余数学相等（浮点差 ~1e-14）：
        # 并列时质量相同，取孔号较小者
        suggestion = suggest_balance(loads((0, 100), (6, 100), (1, 10), (4, 10)))
        assert suggestion is not None
        assert (suggestion.hole, suggestion.mass_g) == (8, 14)
        assert suggestion.predicted_residual_g <= TOLERANCE_G

    def test_tie_broken_by_smaller_mass(self):
        # 孔 9 加 5 g 与加 6 g 的预测残余数学相等（均为 1.0，浮点互有噪声）：
        # 并列时取质量较小者
        suggestion = suggest_balance(loads((0, 100), (6, 100), (1, 1), (3, 5)))
        assert suggestion is not None
        assert (suggestion.hole, suggestion.mass_g) == (9, 5)
        assert suggestion.predicted_residual_g == pytest.approx(1.0)

    def test_prediction_matches_verdict_after_applying(self):
        # 预测残余量与“应用建议后再核验”走同一条计算链路，结论必须一致
        base = loads((0, 100), (6, 100), (3, 10))
        suggestion = suggest_balance(base)
        assert suggestion is not None
        applied = compute_resultant(
            [*base, TubeLoad(hole=suggestion.hole, mass_g=suggestion.mass_g)]
        )
        assert applied.residual_g == suggestion.predicted_residual_g
        assert applied.balanced is True

    def test_suggestion_returned_at_threshold_boundary(self):
        # 唯一可行候选的预测残余 ≈5.0 g（未超阈值）仍应返回
        suggestion = suggest_balance(loads((0, 100), (6, 100), (1, 10), (10, 5)))
        assert suggestion is not None
        assert (suggestion.hole, suggestion.mass_g) == (7, 10)
        assert suggestion.predicted_residual_g <= TOLERANCE_G

    def test_no_suggestion_when_all_candidates_exceed_threshold(self):
        # 对置孔 6 被占用，最近空孔加管也只能压到 ~5.01 g
        assert suggest_balance(loads((0, 100), (6, 90))) is None

    def test_no_suggestion_without_empty_hole(self):
        full = loads(*[(k, 100) for k in range(11)], (11, 120))
        assert compute_resultant(full).balanced is False
        assert suggest_balance(full) is None


class TestCentrifugalForce:
    def test_formula_typical_conversion(self):
        # R=10 g、r=100 mm、n=3000 rpm：
        # F = 0.01 · 0.1 · (2π·50)² ≈ 98.696 N
        force = centrifugal_force_n(10.0, 3000, 100)
        expected = 0.01 * 0.1 * (2 * math.pi * 3000 / 60) ** 2
        assert force == pytest.approx(expected)
        assert force == pytest.approx(98.696044, abs=1e-6)
        assert round2_display(force) == "98.70"

    def test_scales_quadratically_with_speed(self):
        # 转速翻倍、半径不变：离心力变为 4 倍
        low = centrifugal_force_n(10.0, 1000, 100)
        high = centrifugal_force_n(10.0, 2000, 100)
        assert high == pytest.approx(4 * low)

    def test_scales_linearly_with_residual_and_radius(self):
        base = centrifugal_force_n(10.0, 3000, 100)
        assert centrifugal_force_n(20.0, 3000, 100) == pytest.approx(2 * base)
        assert centrifugal_force_n(10.0, 3000, 250) == pytest.approx(2.5 * base)

    def test_uses_unrounded_residual(self):
        # 残余量 4.996…（展示为 5.00）：离心力必须基于未舍入值而非 5.00
        residual = compute_resultant(
            loads((0, 104.996), (6, 100))
        ).residual_g
        assert round2_display(residual) == "5.00"
        force = centrifugal_force_n(residual, 3000, 100)
        assert force == pytest.approx(
            (residual / 1000) * 0.1 * (2 * math.pi * 50) ** 2
        )
        assert force != pytest.approx(centrifugal_force_n(5.0, 3000, 100))

    def test_zero_residual_gives_zero_force(self):
        assert centrifugal_force_n(0.0, 30000, 500) == 0.0

    def test_high_speed_boundary_value(self):
        # 边界：n=30000 rpm、r=500 mm、R=1 g
        force = centrifugal_force_n(1.0, 30000, 500)
        expected = 0.001 * 0.5 * (2 * math.pi * 30000 / 60) ** 2
        assert force == pytest.approx(expected)
        assert force == pytest.approx(4934.8022005, abs=1e-3)


class TestRound2Display:
    @pytest.mark.parametrize(
        "value,expected",
        [
            (2.005, "2.01"),   # 十进制四舍五入（非银行家舍入）
            (2.004, "2.00"),
            (0.005, "0.01"),
            (2.675, "2.68"),
            (0.0, "0.00"),
            (1e-16, "0.00"),
            (-0.0001, "0.00"),  # 不得出现 “-0.00”
            (-2.005, "-2.01"),
            (141.421356237, "141.42"),
            (5.0, "5.00"),
            (359.999, "360.00"),  # 仅展示层；归一化在方向计算中完成
        ],
    )
    def test_half_up_rounding(self, value, expected):
        assert round2_display(value) == expected
