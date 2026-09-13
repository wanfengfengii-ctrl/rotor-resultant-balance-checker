import { describe, expect, it } from "vitest";
import {
  ApiValidationError,
  mapValidationErrors,
  translateMessage,
  type ApiErrorDetail,
} from "./errors";

const detail = (loc: Array<string | number>, msg: string): ApiErrorDetail => ({
  loc,
  msg,
  type: "value_error",
});

describe("mapValidationErrors", () => {
  it("按 tubes 下标把错误映射回孔位", () => {
    // 提交时 holes = [0, 6]，第二支试管（下标 1）的质量越界
    const details = [
      detail(["body", "tubes", 1, "mass_g"], "质量必须在 1 至 500 克之间"),
    ];
    const { fieldErrors, generalErrors } = mapValidationErrors(details, [0, 6]);
    expect(fieldErrors).toEqual({ 6: "质量必须在 1 至 500 克之间" });
    expect(generalErrors).toEqual([]);
  });

  it("无法定位到孔位的错误归入通用错误", () => {
    const details = [
      detail(["body", "tubes"], "至少需要两支试管"),
      detail(["body"], "孔位重复：每个非空孔只能提交一次"),
    ];
    const { fieldErrors, generalErrors } = mapValidationErrors(details, [0]);
    expect(fieldErrors).toEqual({});
    expect(generalErrors).toHaveLength(2);
    expect(generalErrors[0]).toContain("至少");
    expect(generalErrors[1]).toContain("重复");
  });

  it("空 detail 列表兜底为通用错误", () => {
    const { generalErrors } = mapValidationErrors([], []);
    expect(generalErrors).toHaveLength(1);
  });
});

describe("translateMessage", () => {
  it("翻译 Pydantic 常见英文信息", () => {
    expect(
      translateMessage("Input should be a valid integer"),
    ).toBe("必须为整数");
  });

  it("后端中文信息原样保留", () => {
    expect(translateMessage("质量必须在 1 至 500 克之间")).toBe(
      "质量必须在 1 至 500 克之间",
    );
  });
});

describe("ApiValidationError", () => {
  it("携带 detail 列表", () => {
    const details = [detail(["body"], "x")];
    const error = new ApiValidationError(details);
    expect(error.details).toEqual(details);
    expect(error).toBeInstanceOf(Error);
  });
});
