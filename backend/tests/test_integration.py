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
