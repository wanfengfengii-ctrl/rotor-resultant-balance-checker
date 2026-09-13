"""API 层测试：校验规则（422 逐字段错误）与响应内容。"""

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
