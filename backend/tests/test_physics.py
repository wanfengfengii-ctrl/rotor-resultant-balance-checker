"""compute_resultant 与 round2_display 的单元测试。"""

import math

import pytest

from app.physics import (
    TOLERANCE_G,
    TubeLoad,
    compute_resultant,
    direction_display,
    hole_angle_deg,
    round2_display,
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
