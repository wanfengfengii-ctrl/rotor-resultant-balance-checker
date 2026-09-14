import { describe, expect, it } from "vitest";
import {
  buildWeighingError,
  MAX_WEIGHING_ERROR_G,
  MIN_WEIGHING_ERROR_G,
} from "./weighingError";

describe("buildWeighingError", () => {
  it("留空时不带误差，保持原核验方式", () => {
    const result = buildWeighingError("");
    expect(result.value).toBeNull();
    expect(result.error).toBeUndefined();
  });

  it("纯空白同样视为省略误差", () => {
    const result = buildWeighingError("   ");
    expect(result.value).toBeNull();
    expect(result.error).toBeUndefined();
  });

  it("合法小数与整数都可提交（含首尾空白）", () => {
    expect(buildWeighingError(" 0.5 ").value).toBe(0.5);
    expect(buildWeighingError("0").value).toBe(0);
    expect(buildWeighingError("5").value).toBe(5);
    expect(buildWeighingError("4.99").value).toBe(4.99);
    expect(buildWeighingError("+2.5").value).toBe(2.5);
  });

  it("边界值 0 与 5 均可提交", () => {
    expect(buildWeighingError(String(MIN_WEIGHING_ERROR_G)).error).toBeUndefined();
    expect(buildWeighingError(String(MAX_WEIGHING_ERROR_G)).error).toBeUndefined();
  });

  it("非数字输入给出字段错误", () => {
    for (const raw of ["abc", "0.5克", "1.2.3", ".", ".5", "5."]) {
      const result = buildWeighingError(raw);
      expect(result.value).toBeNull();
      expect(result.error).toContain("数字");
    }
  });

  it("超过两位小数给出字段错误", () => {
    for (const raw of ["0.001", "0.505", "1.234", "4.999"]) {
      const result = buildWeighingError(raw);
      expect(result.value).toBeNull();
      expect(result.error).toContain("两位小数");
    }
  });

  it("三位小数即使末位为零也按超过两位小数拒绝", () => {
    for (const raw of ["0.500", "2.500", "0.050", "4.990"]) {
      const result = buildWeighingError(raw);
      expect(result.value).toBeNull();
      expect(result.error).toContain("两位小数");
    }
  });

  it("两位小数末位为零可以提交", () => {
    expect(buildWeighingError("0.50").value).toBe(0.5);
    expect(buildWeighingError("5.00").value).toBe(5);
    expect(buildWeighingError("2.50").value).toBe(2.5);
  });

  it("超出 0–5 克范围给出字段错误", () => {
    for (const raw of ["-0.1", "-1", "5.01", "6", "100"]) {
      const result = buildWeighingError(raw);
      expect(result.value).toBeNull();
      expect(result.error).toContain("0 至 5");
    }
  });
});
