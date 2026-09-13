import { describe, expect, it } from "vitest";
import {
  buildCondition,
  MAX_RADIUS_MM,
  MAX_SPEED_RPM,
  MIN_RADIUS_MM,
  MIN_SPEED_RPM,
} from "./condition";

describe("buildCondition", () => {
  it("两项均留空时不带工况，保持原核验方式", () => {
    const result = buildCondition("", "");
    expect(result.condition).toBeNull();
    expect(result.errors).toEqual({});
  });

  it("两项均为纯空白时同样视为省略工况", () => {
    const result = buildCondition("  ", "");
    expect(result.condition).toBeNull();
    expect(result.errors).toEqual({});
  });

  it("两项都合法时返回整型工况载荷", () => {
    const result = buildCondition(" 3000 ", "100");
    expect(result.condition).toEqual({ speed_rpm: 3000, radius_mm: 100 });
    expect(result.errors).toEqual({});
  });

  it("只填转速：错误定位到缺失的有效半径输入", () => {
    const result = buildCondition("3000", "");
    expect(result.condition).toBeNull();
    expect(result.errors.radius_mm).toContain("同时填写");
    expect(result.errors.speed_rpm).toBeUndefined();
  });

  it("只填有效半径：错误定位到缺失的转速输入", () => {
    const result = buildCondition("", "100");
    expect(result.condition).toBeNull();
    expect(result.errors.speed_rpm).toContain("同时填写");
    expect(result.errors.radius_mm).toBeUndefined();
  });

  it("转速非整数时错误只定位到转速", () => {
    const result = buildCondition("1000.5", "100");
    expect(result.condition).toBeNull();
    expect(result.errors.speed_rpm).toContain("整数");
    expect(result.errors.radius_mm).toBeUndefined();
  });

  it("半径为非数字文本时错误只定位到半径", () => {
    const result = buildCondition("1000", "abc");
    expect(result.condition).toBeNull();
    expect(result.errors.speed_rpm).toBeUndefined();
    expect(result.errors.radius_mm).toContain("整数");
  });

  it("转速超出范围时错误只定位到转速", () => {
    const low = buildCondition("99", "100");
    expect(low.errors.speed_rpm).toContain(String(MIN_SPEED_RPM));
    expect(low.errors.radius_mm).toBeUndefined();

    const high = buildCondition("30001", "100");
    expect(high.errors.speed_rpm).toContain(String(MAX_SPEED_RPM));
    expect(high.errors.radius_mm).toBeUndefined();
  });

  it("半径超出范围时错误只定位到半径", () => {
    const low = buildCondition("1000", "9");
    expect(low.errors.radius_mm).toContain(String(MIN_RADIUS_MM));
    expect(low.errors.speed_rpm).toBeUndefined();

    const high = buildCondition("1000", "501");
    expect(high.errors.radius_mm).toContain(String(MAX_RADIUS_MM));
    expect(high.errors.speed_rpm).toBeUndefined();
  });

  it("边界值（转速 100/30000、半径 10/500）均可提交", () => {
    for (const speed of [MIN_SPEED_RPM, MAX_SPEED_RPM]) {
      for (const radius of [MIN_RADIUS_MM, MAX_RADIUS_MM]) {
        const result = buildCondition(String(speed), String(radius));
        expect(result.errors).toEqual({});
        expect(result.condition).toEqual({
          speed_rpm: speed,
          radius_mm: radius,
        });
      }
    }
  });

  it("两项都非法时各自定位自己的错误", () => {
    const result = buildCondition("0", "1.5");
    expect(result.errors.speed_rpm).toContain(String(MIN_SPEED_RPM));
    expect(result.errors.radius_mm).toContain("整数");
  });
});
