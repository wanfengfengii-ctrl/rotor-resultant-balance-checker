"""API 层测试：校验规则（422 逐字段错误）与响应内容。"""

import math

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def post(payload):
    return client.post("/api/verify", json=payload)


def valid_payload():
    return {"tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 100}]}


class TestHealth:
    def test_health(self):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestHappyPath:
    def test_balanced_pair_passes_with_direction_none(self):
        resp = post(valid_payload())
        assert resp.status_code == 200
        body = resp.json()
        assert body["balanced"] is True
        assert body["verdict"] == "放行"
        assert body["residual_g"] == 0.0
        assert body["residual_display"] == "0.00"
        assert body["direction_deg"] is None
        assert body["direction_display"] == "无"
        assert body["threshold_g"] == 5.0

    def test_unbalanced_pair_rejected(self):
        resp = post({"tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 90}]})
        assert resp.status_code == 200
        body = resp.json()
        assert body["balanced"] is False
        assert body["verdict"] == "拒绝"
        assert body["residual_display"] == "10.00"
        assert body["direction_display"] == "0.00"

    def test_contributions_cover_each_nonempty_hole(self):
        resp = post({"tubes": [{"hole": 0, "mass_g": 100}, {"hole": 3, "mass_g": 100}]})
        body = resp.json()
        assert [c["hole"] for c in body["contributions"]] == [0, 3]
        c0, c3 = body["contributions"]
        assert c0["x_display"] == "100.00"
        assert c0["y_display"] == "0.00"
        assert c3["x_display"] == "0.00"
        assert c3["y_display"] == "100.00"
        assert body["x_display"] == "100.00"
        assert body["y_display"] == "100.00"
        assert body["residual_display"] == "141.42"
        assert body["direction_display"] == "45.00"

    def test_boundary_5g_passes(self):
        resp = post({"tubes": [{"hole": 0, "mass_g": 105}, {"hole": 6, "mass_g": 100}]})
        body = resp.json()
        assert body["residual_display"] == "5.00"
        assert body["balanced"] is True

    def test_direction_normalized_to_360_range(self):
        resp = post({"tubes": [{"hole": 3, "mass_g": 10}, {"hole": 9, "mass_g": 50}]})
        body = resp.json()
        assert body["direction_display"] == "270.00"
        assert 0.0 <= body["direction_deg"] < 360.0

    def test_direction_rounded_to_360_displayed_as_0(self):
        # 359.995…° 舍入后须归一为 0.00，不得显示 360.00
        resp = post(
            {
                "tubes": [
                    {"hole": 10, "mass_g": 26},
                    {"hole": 9, "mass_g": 81},
                    {"hole": 1, "mass_g": 207},
                ]
            }
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["direction_display"] == "0.00"
        assert 0.0 <= body["direction_deg"] < 360.0


class TestSuggestion:
    def test_rejection_includes_actionable_suggestion(self):
        resp = post(
            {
                "tubes": [
                    {"hole": 0, "mass_g": 100},
                    {"hole": 6, "mass_g": 100},
                    {"hole": 3, "mass_g": 10},
                ]
            }
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["balanced"] is False
        assert body["verdict"] == "拒绝"
        suggestion = body["suggestion"]
        assert suggestion is not None
        assert suggestion["hole"] == 9
        assert suggestion["mass_g"] == 10
        assert suggestion["predicted_residual_g"] == 0.0
        assert suggestion["predicted_residual_display"] == "0.00"

    def test_suggestion_prediction_matches_applied_verdict(self):
        # 应用建议后的载荷再次核验：必须放行，且残余量与预测值一致
        tubes = [
            {"hole": 0, "mass_g": 100},
            {"hole": 6, "mass_g": 100},
            {"hole": 3, "mass_g": 10},
        ]
        suggestion = post({"tubes": tubes}).json()["suggestion"]
        applied = post({"tubes": [*tubes, {"hole": suggestion["hole"], "mass_g": suggestion["mass_g"]}]})
        body = applied.json()
        assert body["balanced"] is True
        assert body["verdict"] == "放行"
        assert body["residual_g"] == suggestion["predicted_residual_g"]

    def test_suggestion_null_when_single_tube_cannot_balance(self):
        resp = post({"tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 90}]})
        body = resp.json()
        assert body["balanced"] is False
        assert body["suggestion"] is None
        # 拒绝明细不受影响
        assert body["residual_display"] == "10.00"
        assert body["direction_display"] == "0.00"

    def test_suggestion_null_when_no_empty_hole(self):
        tubes = [{"hole": k, "mass_g": 100} for k in range(11)]
        tubes.append({"hole": 11, "mass_g": 120})
        body = post({"tubes": tubes}).json()
        assert body["balanced"] is False
        assert body["suggestion"] is None

    def test_pass_response_has_null_suggestion(self):
        body = post(valid_payload()).json()
        assert body["balanced"] is True
        assert body["suggestion"] is None


class TestOppositeDifferences:
    def test_rejection_includes_six_sorted_pairs(self):
        resp = post(
            {"tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 90}]}
        )
        body = resp.json()
        pairs = body["opposite_differences"]
        assert pairs is not None
        assert len(pairs) == 6
        assert [(p["first_hole"], p["opposite_hole"]) for p in pairs] == [
            (k, k + 6) for k in range(6)
        ]
        # 已按绝对差值降序
        absolutes = [abs(p["delta_g"]) for p in pairs]
        assert absolutes == sorted(absolutes, reverse=True)

    def test_pair_delta_is_first_minus_opposite_with_displays(self):
        body = post(
            {"tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 90}]}
        ).json()
        first = body["opposite_differences"][0]
        assert first["first_hole"] == 0
        assert first["opposite_hole"] == 6
        assert first["delta_g"] == 10.0
        assert first["delta_display"] == "10.00"
        assert first["x_g"] == pytest.approx(10.0)
        assert first["x_display"] == "10.00"
        assert first["y_display"] == "0.00"

    def test_six_pair_contributions_sum_to_response_resultant(self):
        # 核心验收：六对贡献之和等于原合成分量（未舍入）
        body = post(
            {
                "tubes": [
                    {"hole": 0, "mass_g": 100},
                    {"hole": 1, "mass_g": 70},
                    {"hole": 6, "mass_g": 90},
                    {"hole": 3, "mass_g": 10},
                    {"hole": 10, "mass_g": 26},
                ]
            }
        ).json()
        pairs = body["opposite_differences"]
        assert sum(p["x_g"] for p in pairs) == pytest.approx(body["x_g"], abs=1e-9)
        assert sum(p["y_g"] for p in pairs) == pytest.approx(body["y_g"], abs=1e-9)

    def test_equal_absolute_delta_ordered_by_smaller_hole(self):
        # 对 0：Δ=+10；对 1：0 vs 10 → Δ=−10；并列时孔号 0 在前
        body = post(
            {
                "tubes": [
                    {"hole": 0, "mass_g": 100},
                    {"hole": 6, "mass_g": 90},
                    {"hole": 7, "mass_g": 10},
                ]
            }
        ).json()
        pairs = body["opposite_differences"]
        assert [p["first_hole"] for p in pairs[:2]] == [0, 1]
        assert pairs[0]["delta_g"] == 10.0
        assert pairs[1]["delta_g"] == -10.0
        assert pairs[1]["delta_display"] == "-10.00"

    def test_pass_response_has_null_diagnostics(self):
        body = post(valid_payload()).json()
        assert body["balanced"] is True
        assert body["opposite_differences"] is None

    def test_diagnostics_do_not_affect_existing_fields(self):
        # 既有请求体与判定、明细、建议字段保持原有行为
        body = post(
            {
                "tubes": [
                    {"hole": 0, "mass_g": 100},
                    {"hole": 6, "mass_g": 100},
                    {"hole": 3, "mass_g": 10},
                ]
            }
        ).json()
        assert body["balanced"] is False
        assert body["residual_display"] == "10.00"
        assert body["direction_display"] == "90.00"
        assert body["suggestion"] == {
            "hole": 9,
            "mass_g": 10,
            "predicted_residual_g": 0.0,
            "predicted_residual_display": "0.00",
        }
        pairs = body["opposite_differences"]
        assert pairs[0]["first_hole"] == 3
        assert pairs[0]["delta_g"] == 10.0

    def test_diagnostics_present_alongside_condition(self):
        # 工况不影响诊断；诊断与离心力可同时出现
        body = post(
            {
                "tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 90}],
                "condition": {"speed_rpm": 3000, "radius_mm": 100},
            }
        ).json()
        assert body["condition"] is not None
        assert body["condition"]["centrifugal_force_display"] == "98.70"
        assert len(body["opposite_differences"]) == 6


class TestValidation:
    def test_duplicate_hole_rejected(self):
        resp = post(
            {"tubes": [{"hole": 4, "mass_g": 100}, {"hole": 4, "mass_g": 50}]}
        )
        assert resp.status_code == 422
        assert any("重复" in e["msg"] for e in resp.json()["detail"])

    def test_mass_below_range_rejected(self):
        resp = post(
            {"tubes": [{"hole": 0, "mass_g": 0}, {"hole": 6, "mass_g": 100}]}
        )
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert any(e["loc"][-1] == "mass_g" for e in detail)

    def test_mass_above_range_rejected(self):
        resp = post(
            {"tubes": [{"hole": 0, "mass_g": 501}, {"hole": 6, "mass_g": 100}]}
        )
        assert resp.status_code == 422
        assert any("500" in e["msg"] for e in resp.json()["detail"])

    def test_negative_mass_rejected(self):
        resp = post(
            {"tubes": [{"hole": 0, "mass_g": -5}, {"hole": 6, "mass_g": 100}]}
        )
        assert resp.status_code == 422

    def test_hole_out_of_range_rejected(self):
        resp = post(
            {"tubes": [{"hole": 12, "mass_g": 100}, {"hole": 6, "mass_g": 100}]}
        )
        assert resp.status_code == 422
        assert any(e["loc"][-1] == "hole" for e in resp.json()["detail"])

    def test_single_tube_rejected(self):
        resp = post({"tubes": [{"hole": 0, "mass_g": 100}]})
        assert resp.status_code == 422
        assert any("至少" in e["msg"] for e in resp.json()["detail"])

    def test_empty_tubes_rejected(self):
        resp = post({"tubes": []})
        assert resp.status_code == 422

    def test_non_integer_mass_rejected(self):
        resp = post(
            {"tubes": [{"hole": 0, "mass_g": 10.5}, {"hole": 6, "mass_g": 100}]}
        )
        assert resp.status_code == 422

    def test_string_mass_rejected(self):
        resp = post(
            {"tubes": [{"hole": 0, "mass_g": "abc"}, {"hole": 6, "mass_g": 100}]}
        )
        assert resp.status_code == 422

    def test_error_locations_point_to_offending_tube(self):
        resp = post(
            {"tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 9999}]}
        )
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail[0]["loc"][:2] == ["body", "tubes"]
        assert detail[0]["loc"][2] == 1  # 第二支试管
        assert detail[0]["loc"][3] == "mass_g"


class TestOperatingCondition:
    def test_omitted_condition_stays_null_and_keeps_existing_result(self):
        resp = post(
            {"tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 90}]}
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["condition"] is None
        # 既有字段与调用结果不受影响
        assert body["balanced"] is False
        assert body["residual_display"] == "10.00"
        assert body["direction_display"] == "0.00"

    def test_condition_returns_force_next_to_verdict(self):
        resp = post(
            {
                "tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 90}],
                "condition": {"speed_rpm": 3000, "radius_mm": 100},
            }
        )
        assert resp.status_code == 200
        body = resp.json()
        condition = body["condition"]
        assert condition is not None
        assert condition["speed_rpm"] == 3000
        assert condition["radius_mm"] == 100
        # F = 0.01 · 0.1 · (2π·50)² ≈ 98.696 → 两位小数 98.70
        assert condition["centrifugal_force_n"] == pytest.approx(98.696044, abs=1e-6)
        assert condition["centrifugal_force_display"] == "98.70"
        # 放行结论、阈值、方向、明细、建议均不受工况影响
        assert body["balanced"] is False
        assert body["threshold_g"] == 5.0
        assert body["direction_display"] == "0.00"
        assert len(body["contributions"]) == 2
        assert body["suggestion"] is None

    def test_force_computed_from_unrounded_residual(self):
        # 整数载荷 100@0 + 96@6 + 1@3：残余量 √17 ≈ 4.1231（展示 4.12），
        # 离心力必须按未舍入残余量而非展示值计算
        resp = post(
            {
                "tubes": [
                    {"hole": 0, "mass_g": 100},
                    {"hole": 6, "mass_g": 96},
                    {"hole": 3, "mass_g": 1},
                ],
                "condition": {"speed_rpm": 1000, "radius_mm": 500},
            }
        )
        body = resp.json()
        residual_g = body["residual_g"]
        assert residual_g == pytest.approx(math.sqrt(17), abs=1e-9)
        assert body["residual_display"] == "4.12"
        expected = (residual_g / 1000) * 0.5 * (2 * math.pi * 1000 / 60) ** 2
        assert body["condition"]["centrifugal_force_n"] == pytest.approx(expected)
        rounded_expected = (4.12 / 1000) * 0.5 * (2 * math.pi * 1000 / 60) ** 2
        assert body["condition"]["centrifugal_force_n"] != pytest.approx(
            rounded_expected, abs=1e-6
        )

    def test_condition_does_not_change_balance_chain_for_balanced_load(self):
        without = post({"tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 100}]})
        with_condition = post(
            {
                "tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 100}],
                "condition": {"speed_rpm": 30000, "radius_mm": 500},
            }
        )
        a, b = without.json(), with_condition.json()
        assert a["balanced"] == b["balanced"] is True
        assert a["residual_g"] == b["residual_g"] == 0.0
        # 残余为零：高速工况下离心力仍为零
        assert b["condition"]["centrifugal_force_display"] == "0.00"

    @pytest.mark.parametrize(
        "speed,radius",
        [
            (100, 10),       # 双侧下边界
            (30000, 500),    # 双侧上边界
            (100, 500),
            (30000, 10),
        ],
    )
    def test_boundary_values_accepted(self, speed, radius):
        resp = post(
            {
                "tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 90}],
                "condition": {"speed_rpm": speed, "radius_mm": radius},
            }
        )
        assert resp.status_code == 200
        condition = resp.json()["condition"]
        assert condition["speed_rpm"] == speed
        assert condition["radius_mm"] == radius

    @pytest.mark.parametrize("speed", [99, 30001, 0, -100])
    def test_speed_out_of_range_localized_to_speed_field(self, speed):
        resp = post(
            {
                "tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 100}],
                "condition": {"speed_rpm": speed, "radius_mm": 100},
            }
        )
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert any(
            e["loc"][-2:] == ["condition", "speed_rpm"] for e in detail
        ), detail
        assert all(e["loc"][-1] != "radius_mm" for e in detail)

    @pytest.mark.parametrize("radius", [9, 501, 0, -10])
    def test_radius_out_of_range_localized_to_radius_field(self, radius):
        resp = post(
            {
                "tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 100}],
                "condition": {"speed_rpm": 1000, "radius_mm": radius},
            }
        )
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert any(
            e["loc"][-2:] == ["condition", "radius_mm"] for e in detail
        ), detail
        assert all(e["loc"][-1] != "speed_rpm" for e in detail)

    @pytest.mark.parametrize("bad_speed", [1000.5, "1000", True])
    def test_non_integer_speed_localized_to_speed_field(self, bad_speed):
        resp = post(
            {
                "tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 100}],
                "condition": {"speed_rpm": bad_speed, "radius_mm": 100},
            }
        )
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert any(e["loc"][-1] == "speed_rpm" for e in detail)

    @pytest.mark.parametrize("bad_radius", [100.5, "100", True])
    def test_non_integer_radius_localized_to_radius_field(self, bad_radius):
        resp = post(
            {
                "tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 100}],
                "condition": {"speed_rpm": 1000, "radius_mm": bad_radius},
            }
        )
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert any(e["loc"][-1] == "radius_mm" for e in detail)

    def test_missing_speed_with_radius_localized_to_speed(self):
        resp = post(
            {
                "tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 100}],
                "condition": {"radius_mm": 100},
            }
        )
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert any(e["loc"][-2:] == ["condition", "speed_rpm"] for e in detail)

    def test_missing_radius_with_speed_localized_to_radius(self):
        resp = post(
            {
                "tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 100}],
                "condition": {"speed_rpm": 1000},
            }
        )
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert any(e["loc"][-2:] == ["condition", "radius_mm"] for e in detail)

    def test_condition_with_wrong_type_is_rejected(self):
        resp = post(
            {
                "tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 100}],
                "condition": [1000, 100],
            }
        )
        assert resp.status_code == 422

    def test_condition_kept_through_rejection_and_suggestion_flow(self):
        # 拒绝 + 配平建议场景：工况只附加离心力，建议仍由质量矢量链路决定
        resp = post(
            {
                "tubes": [
                    {"hole": 0, "mass_g": 100},
                    {"hole": 6, "mass_g": 100},
                    {"hole": 3, "mass_g": 10},
                ],
                "condition": {"speed_rpm": 2000, "radius_mm": 150},
            }
        )
        body = resp.json()
        assert body["balanced"] is False
        assert body["suggestion"] is not None
        assert (body["suggestion"]["hole"], body["suggestion"]["mass_g"]) == (9, 10)
        assert body["condition"]["speed_rpm"] == 2000
        assert body["condition"]["radius_mm"] == 150

        # 应用建议后再次核验（仍带同一工况）：放行且离心力归零
        applied = post(
            {
                "tubes": [
                    {"hole": 0, "mass_g": 100},
                    {"hole": 6, "mass_g": 100},
                    {"hole": 3, "mass_g": 10},
                    {"hole": 9, "mass_g": 10},
                ],
                "condition": {"speed_rpm": 2000, "radius_mm": 150},
            }
        )
        applied_body = applied.json()
        assert applied_body["balanced"] is True
        assert applied_body["residual_g"] == 0.0
        assert applied_body["condition"]["centrifugal_force_display"] == "0.00"
