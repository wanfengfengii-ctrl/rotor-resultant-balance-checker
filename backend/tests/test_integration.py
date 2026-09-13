"""联调测试：对真实运行的后端服务发 HTTP 请求。

默认跳过；设置 RUN_INTEGRATION=1 后通过 BACKEND_URL 指向被测服务
（docker compose 的 verify 服务中为 http://backend:8000）。
"""

import os

import pytest

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_INTEGRATION") != "1",
    reason="联调测试仅在 RUN_INTEGRATION=1 时运行",
)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


@pytest.fixture(scope="module")
def http():
    httpx2 = pytest.importorskip("httpx2")
    with httpx2.Client(base_url=BACKEND_URL, timeout=10.0) as client:
        yield client


class TestLiveServer:
    def test_health(self, http):
        resp = http.get("/api/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}

    def test_balanced_verdict_over_http(self, http):
        resp = http.post(
            "/api/verify",
            json={"tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 100}]},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["balanced"] is True
        assert body["verdict"] == "放行"
        assert body["direction_display"] == "无"

    def test_unbalanced_verdict_over_http(self, http):
        resp = http.post(
            "/api/verify",
            json={"tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 90}]},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["balanced"] is False
        assert body["residual_display"] == "10.00"

    def test_rejection_suggestion_over_http(self, http):
        resp = http.post(
            "/api/verify",
            json={
                "tubes": [
                    {"hole": 0, "mass_g": 100},
                    {"hole": 6, "mass_g": 100},
                    {"hole": 3, "mass_g": 10},
                ]
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["balanced"] is False
        assert body["suggestion"] is not None
        assert body["suggestion"]["hole"] == 9
        assert body["suggestion"]["mass_g"] == 10
        assert body["suggestion"]["predicted_residual_display"] == "0.00"

    def test_no_feasible_suggestion_over_http(self, http):
        resp = http.post(
            "/api/verify",
            json={"tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 90}]},
        )
        assert resp.status_code == 200
        assert resp.json()["suggestion"] is None

    def test_validation_error_over_http(self, http):
        resp = http.post(
            "/api/verify",
            json={"tubes": [{"hole": 2, "mass_g": 600}, {"hole": 8, "mass_g": 100}]},
        )
        assert resp.status_code == 422
        assert isinstance(resp.json()["detail"], list)

    def test_duplicate_hole_over_http(self, http):
        resp = http.post(
            "/api/verify",
            json={"tubes": [{"hole": 5, "mass_g": 10}, {"hole": 5, "mass_g": 20}]},
        )
        assert resp.status_code == 422

    def test_omitted_condition_is_null_over_http(self, http):
        resp = http.post(
            "/api/verify",
            json={"tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 90}]},
        )
        assert resp.status_code == 200
        assert resp.json()["condition"] is None

    def test_centrifugal_force_over_http(self, http):
        resp = http.post(
            "/api/verify",
            json={
                "tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 90}],
                "condition": {"speed_rpm": 3000, "radius_mm": 100},
            },
        )
        assert resp.status_code == 200
        condition = resp.json()["condition"]
        assert condition["speed_rpm"] == 3000
        assert condition["radius_mm"] == 100
        # F = 0.01 · 0.1 · (2π·50)² ≈ 98.696 → 98.70 N
        assert condition["centrifugal_force_n"] == pytest.approx(98.696044, abs=1e-6)
        assert condition["centrifugal_force_display"] == "98.70"

    def test_condition_validation_localized_over_http(self, http):
        resp = http.post(
            "/api/verify",
            json={
                "tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 100}],
                "condition": {"speed_rpm": 99, "radius_mm": 100},
            },
        )
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert any(
            e["loc"][-2:] == ["condition", "speed_rpm"] for e in detail
        )

    def test_opposite_differences_over_http(self, http):
        resp = http.post(
            "/api/verify",
            json={
                "tubes": [
                    {"hole": 0, "mass_g": 100},
                    {"hole": 1, "mass_g": 70},
                    {"hole": 6, "mass_g": 90},
                ]
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["balanced"] is False
        pairs = body["opposite_differences"]
        assert len(pairs) == 6
        # 六对贡献之和等于原合成分量
        assert sum(p["x_g"] for p in pairs) == pytest.approx(body["x_g"], abs=1e-9)
        assert sum(p["y_g"] for p in pairs) == pytest.approx(body["y_g"], abs=1e-9)
        # 绝对差降序：对 1 差 70 居首，对 0 差 10 次之
        assert [p["first_hole"] for p in pairs[:2]] == [1, 0]

    def test_opposite_differences_null_on_pass_over_http(self, http):
        resp = http.post(
            "/api/verify",
            json={"tubes": [{"hole": 0, "mass_g": 100}, {"hole": 6, "mass_g": 100}]},
        )
        assert resp.status_code == 200
        assert resp.json()["opposite_differences"] is None
