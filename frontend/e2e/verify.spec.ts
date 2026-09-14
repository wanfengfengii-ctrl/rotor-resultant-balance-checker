import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("对置等质量：放行，残余 0.00 g，方向为无", async ({ page }) => {
  await page.getByTestId("mass-input-0").fill("100");
  await page.getByTestId("mass-input-6").fill("100");
  await page.getByRole("button", { name: "核验" }).click();

  await expect(page.getByTestId("verdict")).toHaveText("放行");
  await expect(page.getByTestId("residual")).toHaveText("0.00");
  await expect(page.getByTestId("direction")).toHaveText("无");
  // 每个非空孔的贡献各占一行
  await expect(page.getByTestId("contribution-0")).toContainText("100");
  await expect(page.getByTestId("contribution-6")).toContainText("100");
  // 放行时不出现配平建议
  await expect(page.getByTestId("suggestion")).toHaveCount(0);
  await expect(page.getByTestId("suggestion-none")).toHaveCount(0);
});

test("偏载 10 g：拒绝，方向 0.00°", async ({ page }) => {
  await page.getByTestId("mass-input-0").fill("100");
  await page.getByTestId("mass-input-6").fill("90");
  await page.getByRole("button", { name: "核验" }).click();

  await expect(page.getByTestId("verdict")).toHaveText("拒绝");
  await expect(page.getByTestId("residual")).toHaveText("10.00");
  await expect(page.getByTestId("direction")).toHaveText("0.00°");
  await expect(page.getByTestId("total-x")).toHaveText("10.00");
  await expect(page.getByTestId("total-y")).toHaveText("0.00");
});

test("越界质量：仅显示逐字段错误，不出现结论", async ({ page }) => {
  await page.getByTestId("mass-input-0").fill("600");
  await page.getByTestId("mass-input-6").fill("100");
  await page.getByRole("button", { name: "核验" }).click();

  await expect(page.getByTestId("error-0")).toBeVisible();
  await expect(page.getByTestId("error-0")).toContainText("500");
  await expect(page.getByTestId("verdict")).toHaveCount(0);
});

test("不足两支试管：仅显示通用错误", async ({ page }) => {
  await page.getByTestId("mass-input-0").fill("100");
  await page.getByRole("button", { name: "核验" }).click();

  await expect(page.getByTestId("general-errors")).toContainText("至少");
  await expect(page.getByTestId("verdict")).toHaveCount(0);
});

test("非整数录入：前端直接提示，不发出请求", async ({ page }) => {
  await page.getByTestId("mass-input-0").fill("abc");
  await page.getByTestId("mass-input-6").fill("100");
  await page.getByRole("button", { name: "核验" }).click();

  await expect(page.getByTestId("error-0")).toContainText("整数");
  await expect(page.getByTestId("verdict")).toHaveCount(0);
});

test("合成方向舍入为 360.00° 时归一显示 0.00°", async ({ page }) => {
  await page.getByTestId("mass-input-10").fill("26");
  await page.getByTestId("mass-input-9").fill("81");
  await page.getByTestId("mass-input-1").fill("207");
  await page.getByRole("button", { name: "核验" }).click();

  await expect(page.getByTestId("direction")).toHaveText("0.00°");
});

test("修改任何孔位后立即清除旧结论", async ({ page }) => {
  await page.getByTestId("mass-input-0").fill("100");
  await page.getByTestId("mass-input-6").fill("100");
  await page.getByRole("button", { name: "核验" }).click();
  await expect(page.getByTestId("verdict")).toHaveText("放行");

  await page.getByTestId("mass-input-6").fill("90");
  await expect(page.getByTestId("verdict")).toHaveCount(0);
  await expect(page.getByTestId("result-empty")).toBeVisible();

  // 重新核验得到新的唯一结论
  await page.getByRole("button", { name: "核验" }).click();
  await expect(page.getByTestId("verdict")).toHaveText("拒绝");
  await expect(page.getByTestId("residual")).toHaveText("10.00");
});

test("放行结论绝不会被随后的非法提交沿用", async ({ page }) => {
  await page.getByTestId("mass-input-0").fill("100");
  await page.getByTestId("mass-input-6").fill("100");
  await page.getByRole("button", { name: "核验" }).click();
  await expect(page.getByTestId("verdict")).toHaveText("放行");

  await page.getByTestId("mass-input-0").fill("999");
  await page.getByRole("button", { name: "核验" }).click();
  await expect(page.getByTestId("error-0")).toBeVisible();
  await expect(page.getByTestId("verdict")).toHaveCount(0);
});

test("拒绝时展示配平建议，应用后再次核验放行", async ({ page }) => {
  await page.getByTestId("mass-input-0").fill("100");
  await page.getByTestId("mass-input-6").fill("100");
  await page.getByTestId("mass-input-3").fill("10");
  await page.getByRole("button", { name: "核验" }).click();

  // 拒绝结果旁给出建议孔位、质量与预测残余量
  await expect(page.getByTestId("verdict")).toHaveText("拒绝");
  await expect(page.getByTestId("suggestion")).toContainText("9");
  await expect(page.getByTestId("suggestion")).toContainText("10 g");
  await expect(page.getByTestId("suggestion")).toContainText("0.00 g");

  // 应用建议：写入对应空孔并清除旧结论
  await page.getByTestId("apply-suggestion").click();
  await expect(page.getByTestId("mass-input-9")).toHaveValue("10");
  await expect(page.getByTestId("verdict")).toHaveCount(0);

  // 再通过原核验操作取得最终结论
  await page.getByRole("button", { name: "核验" }).click();
  await expect(page.getByTestId("verdict")).toHaveText("放行");
  await expect(page.getByTestId("residual")).toHaveText("0.00");
});

test("单支试管无法配平时明确提示并保留拒绝明细", async ({ page }) => {
  await page.getByTestId("mass-input-0").fill("100");
  await page.getByTestId("mass-input-6").fill("90");
  await page.getByRole("button", { name: "核验" }).click();

  await expect(page.getByTestId("verdict")).toHaveText("拒绝");
  await expect(page.getByTestId("suggestion-none")).toContainText(
    "无法通过单支试管",
  );
  await expect(page.getByTestId("suggestion")).toHaveCount(0);
  // 本次拒绝明细保留
  await expect(page.getByTestId("residual")).toHaveText("10.00");
  await expect(page.getByTestId("contribution-0")).toContainText("100");
  await expect(page.getByTestId("contribution-6")).toContainText("90");
});

/** 把 /api/verify 的响应延迟 ms 毫秒，模拟飞行途中的请求 */
async function delayVerifyApi(
  page: import("@playwright/test").Page,
  ms: number,
) {
  await page.route("**/api/verify", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

test("响应返回前修改孔位：迟到的拒绝结论被丢弃，保持清空等待重新核验", async ({
  page,
}) => {
  await delayVerifyApi(page, 600);

  await page.getByTestId("mass-input-0").fill("100");
  await page.getByTestId("mass-input-6").fill("90");
  await page.getByRole("button", { name: "核验" }).click();

  // 响应返回前修改孔位：旧结论立即清除
  await page.getByTestId("mass-input-6").fill("100");
  await expect(page.getByTestId("verdict")).toHaveCount(0);

  // 迟到的拒绝响应到达后也不得恢复修改前的明细
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("verdict")).toHaveCount(0);
  await expect(page.getByTestId("result-empty")).toBeVisible();

  // 按当前载荷重新核验，得到唯一结论
  await page.getByRole("button", { name: "核验" }).click();
  await expect(page.getByTestId("verdict")).toHaveText("放行");
  await expect(page.getByTestId("residual")).toHaveText("0.00");
});

test("等待拒绝响应时已占用建议目标孔：旧建议失效且不覆盖当前值", async ({
  page,
}) => {
  await delayVerifyApi(page, 600);

  await page.getByTestId("mass-input-0").fill("100");
  await page.getByTestId("mass-input-6").fill("100");
  await page.getByTestId("mass-input-3").fill("10");
  await page.getByRole("button", { name: "核验" }).click();

  // 响应返回前在建议目标孔（9 号）录入新质量
  await page.getByTestId("mass-input-9").fill("55");

  // 迟到的旧建议不得出现，已占孔位保持当前值
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("suggestion")).toHaveCount(0);
  await expect(page.getByTestId("verdict")).toHaveCount(0);
  await expect(page.getByTestId("mass-input-9")).toHaveValue("55");

  // 重新核验按当前载荷（含 9 号孔 55 g）判定
  await page.getByRole("button", { name: "核验" }).click();
  await expect(page.getByTestId("verdict")).toHaveText("拒绝");
  await expect(page.getByTestId("contribution-9")).toContainText("55");
});

test("响应返回前修正越界质量：过期的校验错误被丢弃，新值保持无误", async ({
  page,
}) => {
  await delayVerifyApi(page, 600);

  await page.getByTestId("mass-input-0").fill("600");
  await page.getByTestId("mass-input-6").fill("100");
  await page.getByRole("button", { name: "核验" }).click();

  // 422 响应返回前把该孔改为合法值
  await page.getByTestId("mass-input-0").fill("100");

  // 迟到的 422 不得把旧错误挂到当前合法录入上
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("error-0")).toHaveCount(0);
  await expect(page.getByTestId("mass-input-0")).toHaveValue("100");

  // 当前载荷可直接核验通过
  await page.getByRole("button", { name: "核验" }).click();
  await expect(page.getByTestId("verdict")).toHaveText("放行");
});

test("核验等待中可立即清空：在途结果失效，页面保持清空", async ({ page }) => {
  await delayVerifyApi(page, 600);

  await page.getByTestId("mass-input-0").fill("100");
  await page.getByTestId("mass-input-6").fill("90");
  await page.getByRole("button", { name: "核验" }).click();

  // 等待响应期间清空按钮立即可用
  const clearButton = page.getByRole("button", { name: "清空" });
  await expect(clearButton).toBeEnabled();
  await clearButton.click();

  // 录入与计数立即复位
  await expect(page.getByTestId("mass-input-0")).toHaveValue("");
  await expect(page.getByTestId("mass-input-6")).toHaveValue("");
  await expect(page.getByTestId("filled-count")).toHaveText("已录入 0 支试管");

  // 迟到的在途结果一律失效：不出现结论，页面保持清空
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("verdict")).toHaveCount(0);
  await expect(page.getByTestId("result-empty")).toBeVisible();
});

test("核验等待中修改孔位后：立即允许按当前载荷重新核验", async ({ page }) => {
  await delayVerifyApi(page, 600);

  await page.getByTestId("mass-input-0").fill("100");
  await page.getByTestId("mass-input-6").fill("90");
  await page.getByRole("button", { name: "核验" }).click();

  // 等待响应期间修改孔位形成新载荷：核验按钮立即恢复可用
  await page.getByTestId("mass-input-6").fill("100");
  const submitButton = page.getByRole("button", { name: "核验" });
  await expect(submitButton).toBeEnabled();

  // 立即按当前载荷重新核验，得到唯一结论（在途旧响应被丢弃）
  await submitButton.click();
  await expect(page.getByTestId("verdict")).toHaveText("放行");
  await expect(page.getByTestId("residual")).toHaveText("0.00");
});

test("非法质量不计入已录入试管数", async ({ page }) => {
  await page.getByTestId("mass-input-0").fill("-5");
  await page.getByTestId("mass-input-1").fill("501");
  await page.getByTestId("mass-input-2").fill("99999999999999999999");
  await expect(page.getByTestId("filled-count")).toHaveText("已录入 0 支试管");

  await page.getByTestId("mass-input-3").fill("100");
  await page.getByTestId("mass-input-4").fill("500");
  await expect(page.getByTestId("filled-count")).toHaveText("已录入 2 支试管");
});

test.describe("对置差异诊断", () => {
  test("拒绝时展示差异最大的三对及贡献，放行时不展开", async ({ page }) => {
    await page.getByTestId("mass-input-3").fill("81");
    await page.getByTestId("mass-input-1").fill("70");
    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("90");
    await page.getByTestId("mass-input-10").fill("26");
    await page.getByRole("button", { name: "核验" }).click();

    await expect(page.getByTestId("verdict")).toHaveText("拒绝");
    const diagnostics = page.getByTestId("opposite-diagnostics");
    await expect(diagnostics).toBeVisible();
    // 只展示前三对，顺序为按绝对差降序：对 3（71）、对 1（70）、对 4（26）
    const shown = page.locator("button[data-testid^='opposite-pair-']");
    await expect(shown).toHaveCount(3);
    await expect(shown.nth(0)).toHaveAttribute("data-testid", "opposite-pair-3");
    await expect(shown.nth(1)).toHaveAttribute("data-testid", "opposite-pair-1");
    await expect(shown.nth(2)).toHaveAttribute("data-testid", "opposite-pair-4");
    await expect(page.getByTestId("pair-delta-3")).toContainText("+81.00");
    await expect(page.getByTestId("opposite-pair-3")).toContainText("X");
    await expect(page.getByTestId("opposite-pair-3")).toContainText("Y");

    // 放行结果不展开诊断：补齐各对置孔使六对差值归零
    await page.getByTestId("mass-input-9").fill("81");
    await page.getByTestId("mass-input-7").fill("70");
    await page.getByTestId("mass-input-6").fill("100");
    await page.getByTestId("mass-input-4").fill("26");
    await page.getByRole("button", { name: "核验" }).click();
    await expect(page.getByTestId("verdict")).toHaveText("放行");
    await expect(page.getByTestId("opposite-diagnostics")).toHaveCount(0);
  });

  test("点选一对：转子图只高亮对应两孔，切换与再次点选生效", async ({ page }) => {
    await page.getByTestId("mass-input-3").fill("81");
    await page.getByTestId("mass-input-1").fill("70");
    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("90");
    await page.getByRole("button", { name: "核验" }).click();

    // 初始无高亮
    await expect(page.locator("[data-pair-highlight='true']")).toHaveCount(0);
    await expect(page.getByTestId("pair-link")).toHaveCount(0);

    await page.getByTestId("opposite-pair-3").click();
    let highlighted = page.locator("[data-pair-highlight='true']");
    await expect(highlighted).toHaveCount(2);
    await expect(page.getByTestId("hole-3")).toHaveAttribute(
      "data-pair-highlight",
      "true",
    );
    await expect(page.getByTestId("hole-9")).toHaveAttribute(
      "data-pair-highlight",
      "true",
    );
    // 其余孔位不高亮
    await expect(page.getByTestId("hole-0")).not.toHaveAttribute(
      "data-pair-highlight",
    );
    // 两孔之间画一条穿过圆心的连线（水平连线的几何包围盒高度为 0，按存在性断言）
    await expect(page.getByTestId("pair-link")).toHaveCount(1);
    await expect(page.getByTestId("opposite-pair-3")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // 切换到另一对：只剩新的两孔高亮
    await page.getByTestId("opposite-pair-1").click();
    highlighted = page.locator("[data-pair-highlight='true']");
    await expect(highlighted).toHaveCount(2);
    await expect(page.getByTestId("hole-1")).toHaveAttribute(
      "data-pair-highlight",
      "true",
    );
    await expect(page.getByTestId("hole-7")).toHaveAttribute(
      "data-pair-highlight",
      "true",
    );
    await expect(page.getByTestId("hole-3")).not.toHaveAttribute(
      "data-pair-highlight",
    );

    // 再次点选当前对：取消高亮
    await page.getByTestId("opposite-pair-1").click();
    await expect(page.locator("[data-pair-highlight='true']")).toHaveCount(0);
    await expect(page.getByTestId("pair-link")).toHaveCount(0);
  });

  test("修改任一质量后高亮与旧结果一起清除", async ({ page }) => {
    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("90");
    await page.getByRole("button", { name: "核验" }).click();
    await page.getByTestId("opposite-pair-0").click();
    await expect(page.locator("[data-pair-highlight='true']")).toHaveCount(2);

    await page.getByTestId("mass-input-6").fill("95");
    await expect(page.getByTestId("verdict")).toHaveCount(0);
    await expect(page.locator("[data-pair-highlight='true']")).toHaveCount(0);
    await expect(page.getByTestId("pair-link")).toHaveCount(0);
  });

  test("应用配平建议后高亮与旧结果一起清除", async ({ page }) => {
    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("100");
    await page.getByTestId("mass-input-3").fill("10");
    await page.getByRole("button", { name: "核验" }).click();
    await expect(page.getByTestId("verdict")).toHaveText("拒绝");

    // 差异最大的一对为孔 3 ↔ 孔 9
    await page.getByTestId("opposite-pair-3").click();
    await expect(page.locator("[data-pair-highlight='true']")).toHaveCount(2);

    await page.getByTestId("apply-suggestion").click();
    await expect(page.getByTestId("verdict")).toHaveCount(0);
    await expect(page.locator("[data-pair-highlight='true']")).toHaveCount(0);
    await expect(page.getByTestId("pair-link")).toHaveCount(0);
    await expect(page.getByTestId("mass-input-9")).toHaveValue("10");
  });

  test("提交校验失败时不保留诊断高亮", async ({ page }) => {
    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("90");
    await page.getByRole("button", { name: "核验" }).click();
    await page.getByTestId("opposite-pair-0").click();
    await expect(page.locator("[data-pair-highlight='true']")).toHaveCount(2);

    // 改为越界质量后提交：只显示错误，旧结果与高亮均消失
    await page.getByTestId("mass-input-0").fill("600");
    await page.getByRole("button", { name: "核验" }).click();
    await expect(page.getByTestId("error-0")).toBeVisible();
    await expect(page.getByTestId("verdict")).toHaveCount(0);
    await expect(page.getByTestId("opposite-diagnostics")).toHaveCount(0);
    await expect(page.locator("[data-pair-highlight='true']")).toHaveCount(0);
  });

  test("网络失败时不保留诊断高亮，恢复后重新核验正常", async ({ page }) => {
    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("90");
    await page.getByRole("button", { name: "核验" }).click();
    await page.getByTestId("opposite-pair-0").click();
    await expect(page.locator("[data-pair-highlight='true']")).toHaveCount(2);

    // 下一次核验请求直接失败：旧结果与高亮被清除，错误提示保留
    await page.route("**/api/verify", (route) => route.abort("failed"));
    await page.getByRole("button", { name: "核验" }).click();
    await expect(page.getByTestId("general-errors")).toBeVisible();
    await expect(page.getByTestId("verdict")).toHaveCount(0);
    await expect(page.locator("[data-pair-highlight='true']")).toHaveCount(0);
    await expect(page.getByTestId("pair-link")).toHaveCount(0);

    await page.unroute("**/api/verify");
    await page.getByRole("button", { name: "核验" }).click();
    await expect(page.getByTestId("verdict")).toHaveText("拒绝");
    await expect(page.locator("[data-pair-highlight='true']")).toHaveCount(0);
    // 新结果出来后可以重新点选
    await page.getByTestId("opposite-pair-0").click();
    await expect(page.locator("[data-pair-highlight='true']")).toHaveCount(2);
  });

  test("绝对差并列时按较小孔号排序", async ({ page }) => {
    // 对 0：100 vs 90 → +10；对 1：空 vs 10 → −10；其余为 0
    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("90");
    await page.getByTestId("mass-input-7").fill("10");
    await page.getByRole("button", { name: "核验" }).click();

    const shown = page.locator("button[data-testid^='opposite-pair-']");
    await expect(shown.nth(0)).toHaveAttribute("data-testid", "opposite-pair-0");
    await expect(shown.nth(1)).toHaveAttribute("data-testid", "opposite-pair-1");
  });

  test("旧版响应缺少诊断字段时仍正常显示结论", async ({ page }) => {
    await page.route("**/api/verify", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      delete body.opposite_differences;
      await route.fulfill({ response, json: body });
    });

    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("90");
    await page.getByRole("button", { name: "核验" }).click();

    await expect(page.getByTestId("verdict")).toHaveText("拒绝");
    await expect(page.getByTestId("residual")).toHaveText("10.00");
    await expect(page.getByTestId("opposite-diagnostics")).toHaveCount(0);
  });

  test("飞行途中修改孔位：过期拒绝响应不回填诊断与高亮", async ({ page }) => {
    await delayVerifyApi(page, 600);

    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("90");
    await page.getByRole("button", { name: "核验" }).click();

    // 响应返回前修改孔位
    await page.getByTestId("mass-input-6").fill("100");
    await page.waitForTimeout(1200);
    await expect(page.getByTestId("verdict")).toHaveCount(0);
    await expect(page.getByTestId("opposite-diagnostics")).toHaveCount(0);
    await expect(page.locator("[data-pair-highlight='true']")).toHaveCount(0);

    // 按当前载荷核验：放行，无诊断
    await page.getByRole("button", { name: "核验" }).click();
    await expect(page.getByTestId("verdict")).toHaveText("放行");
    await expect(page.getByTestId("opposite-diagnostics")).toHaveCount(0);
  });
});

test.describe("可选工况与离心力", () => {
  test("不填工况时结果面板无工况区，核验行为与原来一致", async ({ page }) => {
    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("90");
    await page.getByRole("button", { name: "核验" }).click();

    await expect(page.getByTestId("verdict")).toHaveText("拒绝");
    await expect(page.getByTestId("condition-result")).toHaveCount(0);
  });

  test("转速与有效半径完整时：工况参数与离心力显示在结论旁", async ({
    page,
  }) => {
    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("90");
    await page.getByTestId("speed-input").fill("3000");
    await page.getByTestId("radius-input").fill("100");
    await page.getByRole("button", { name: "核验" }).click();

    // 放行阈值、方向、明细仍由质量矢量链路决定
    await expect(page.getByTestId("verdict")).toHaveText("拒绝");
    await expect(page.getByTestId("residual")).toHaveText("10.00");
    await expect(page.getByTestId("direction")).toHaveText("0.00°");

    // F = (10/1000)(100/1000)(2π·3000/60)² ≈ 98.696 → 98.70 N
    await expect(page.getByTestId("condition-speed")).toContainText("3000");
    await expect(page.getByTestId("condition-radius")).toContainText("100");
    await expect(page.getByTestId("centrifugal-force")).toHaveText(
      /离心力\s*98\.70\s*N/,
    );
  });

  test("放行时残余为零，离心力显示 0.00 N", async ({ page }) => {
    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("100");
    await page.getByTestId("speed-input").fill("30000");
    await page.getByTestId("radius-input").fill("500");
    await page.getByRole("button", { name: "核验" }).click();

    await expect(page.getByTestId("verdict")).toHaveText("放行");
    await expect(page.getByTestId("centrifugal-force")).toContainText("0.00 N");
  });

  test("只填转速：错误定位到空着的有效半径输入，不展示旧结论", async ({
    page,
  }) => {
    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("90");
    await page.getByTestId("speed-input").fill("3000");
    await page.getByRole("button", { name: "核验" }).click();

    await expect(page.getByTestId("radius-error")).toBeVisible();
    await expect(page.getByTestId("radius-error")).toContainText("同时填写");
    await expect(page.getByTestId("speed-error")).toHaveCount(0);
    await expect(page.getByTestId("verdict")).toHaveCount(0);
  });

  test("只填有效半径：错误定位到空着的转速输入", async ({ page }) => {
    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("90");
    await page.getByTestId("radius-input").fill("100");
    await page.getByRole("button", { name: "核验" }).click();

    await expect(page.getByTestId("speed-error")).toBeVisible();
    await expect(page.getByTestId("radius-error")).toHaveCount(0);
    await expect(page.getByTestId("verdict")).toHaveCount(0);
  });

  test("转速越界：错误定位到转速输入，不展示旧结论与旧离心力", async ({
    page,
  }) => {
    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("90");
    // 先取得一次带工况的结论
    await page.getByTestId("speed-input").fill("3000");
    await page.getByTestId("radius-input").fill("100");
    await page.getByRole("button", { name: "核验" }).click();
    await expect(page.getByTestId("centrifugal-force")).toBeVisible();

    // 改为越界转速后重新核验：旧结论 / 旧离心力不得沿用
    await page.getByTestId("speed-input").fill("99");
    await page.getByRole("button", { name: "核验" }).click();
    await expect(page.getByTestId("speed-error")).toContainText("100");
    await expect(page.getByTestId("radius-error")).toHaveCount(0);
    await expect(page.getByTestId("verdict")).toHaveCount(0);
    await expect(page.getByTestId("centrifugal-force")).toHaveCount(0);
  });

  test("半径非整数：错误定位到半径输入", async ({ page }) => {
    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("90");
    await page.getByTestId("speed-input").fill("3000");
    await page.getByTestId("radius-input").fill("abc");
    await page.getByRole("button", { name: "核验" }).click();

    await expect(page.getByTestId("radius-error")).toContainText("整数");
    await expect(page.getByTestId("speed-error")).toHaveCount(0);
    await expect(page.getByTestId("verdict")).toHaveCount(0);
  });

  test("边界工况（100 转/分钟、10 毫米；30000 转/分钟、500 毫米）可用", async ({
    page,
  }) => {
    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("90");

    await page.getByTestId("speed-input").fill("100");
    await page.getByTestId("radius-input").fill("10");
    await page.getByRole("button", { name: "核验" }).click();
    await expect(page.getByTestId("centrifugal-force")).toContainText("0.01 N");

    await page.getByTestId("speed-input").fill("30000");
    await page.getByTestId("radius-input").fill("500");
    await page.getByRole("button", { name: "核验" }).click();
    // F = 0.01 · 0.5 · (2π·500)² ≈ 49348.02 N
    await expect(page.getByTestId("centrifugal-force")).toContainText("49348.02 N");
  });

  test("应用配平建议后工况参数保留，再次核验离心力归零", async ({
    page,
  }) => {
    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("100");
    await page.getByTestId("mass-input-3").fill("10");
    await page.getByTestId("speed-input").fill("3000");
    await page.getByTestId("radius-input").fill("100");
    await page.getByRole("button", { name: "核验" }).click();

    await expect(page.getByTestId("verdict")).toHaveText("拒绝");
    await expect(page.getByTestId("centrifugal-force")).toContainText("98.70 N");

    // 应用建议：工况输入原样保留
    await page.getByTestId("apply-suggestion").click();
    await expect(page.getByTestId("speed-input")).toHaveValue("3000");
    await expect(page.getByTestId("radius-input")).toHaveValue("100");

    // 再次核验：放行，残余与离心力均为 0.00
    await page.getByRole("button", { name: "核验" }).click();
    await expect(page.getByTestId("verdict")).toHaveText("放行");
    await expect(page.getByTestId("residual")).toHaveText("0.00");
    await expect(page.getByTestId("centrifugal-force")).toContainText("0.00 N");
  });

  test("修改工况参数立即清除旧结论", async ({ page }) => {
    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("mass-input-6").fill("90");
    await page.getByTestId("speed-input").fill("3000");
    await page.getByTestId("radius-input").fill("100");
    await page.getByRole("button", { name: "核验" }).click();
    await expect(page.getByTestId("verdict")).toHaveText("拒绝");

    await page.getByTestId("speed-input").fill("2000");
    await expect(page.getByTestId("verdict")).toHaveCount(0);
    await expect(page.getByTestId("condition-result")).toHaveCount(0);
    await expect(page.getByTestId("result-empty")).toBeVisible();
  });

  test("清空按钮同时复位工况输入", async ({ page }) => {
    await page.getByTestId("mass-input-0").fill("100");
    await page.getByTestId("speed-input").fill("3000");
    await page.getByTestId("radius-input").fill("100");
    await page.getByRole("button", { name: "清空" }).click();

    await expect(page.getByTestId("speed-input")).toHaveValue("");
    await expect(page.getByTestId("radius-input")).toHaveValue("");
  });
});
