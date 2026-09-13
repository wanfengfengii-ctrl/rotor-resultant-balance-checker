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
