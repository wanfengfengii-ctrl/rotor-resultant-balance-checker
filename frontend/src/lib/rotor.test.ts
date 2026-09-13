import { describe, expect, it } from "vitest";
import { buildTubes, countFilled, HOLE_COUNT } from "./rotor";

const empty = () => Array(HOLE_COUNT).fill("");

describe("buildTubes", () => {
  it("全部留空时不产生任何试管", () => {
    const { tubes, holes, fieldErrors } = buildTubes(empty());
    expect(tubes).toEqual([]);
    expect(holes).toEqual([]);
    expect(fieldErrors).toEqual({});
  });

  it("空字符串、纯空白与 0 都按空孔处理", () => {
    const inputs = empty();
    inputs[0] = "";
    inputs[1] = "   ";
    inputs[2] = "0";
    inputs[3] = " 0 ";
    const { tubes } = buildTubes(inputs);
    expect(tubes).toEqual([]);
  });

  it("收集非空孔的整数质量并保留孔位顺序", () => {
    const inputs = empty();
    inputs[0] = "100";
    inputs[6] = " 90 ";
    inputs[11] = "5";
    const { tubes, holes } = buildTubes(inputs);
    expect(tubes).toEqual([
      { hole: 0, mass_g: 100 },
      { hole: 6, mass_g: 90 },
      { hole: 11, mass_g: 5 },
    ]);
    expect(holes).toEqual([0, 6, 11]);
  });

  it("非整数输入不提交，转为逐字段错误", () => {
    const inputs = empty();
    inputs[0] = "abc";
    inputs[1] = "1.5";
    inputs[2] = "10克";
    inputs[3] = "100";
    const { tubes, fieldErrors } = buildTubes(inputs);
    expect(tubes).toEqual([{ hole: 3, mass_g: 100 }]);
    expect(Object.keys(fieldErrors).map(Number).sort()).toEqual([0, 1, 2]);
    expect(fieldErrors[0]).toContain("整数");
  });

  it("越界与负数仍交给 API 判定（前端不拦截）", () => {
    const inputs = empty();
    inputs[0] = "501";
    inputs[6] = "-5";
    const { tubes, fieldErrors } = buildTubes(inputs);
    expect(fieldErrors).toEqual({});
    expect(tubes).toEqual([
      { hole: 0, mass_g: 501 },
      { hole: 6, mass_g: -5 },
    ]);
  });

  it("带正号的整数可以解析", () => {
    const inputs = empty();
    inputs[4] = "+50";
    const { tubes } = buildTubes(inputs);
    expect(tubes).toEqual([{ hole: 4, mass_g: 50 }]);
  });
});

describe("countFilled", () => {
  it("统计有效录入的试管数", () => {
    const inputs = empty();
    inputs[0] = "100";
    inputs[1] = "abc"; // 非法，不计入
    inputs[2] = "0"; // 空孔，不计入
    inputs[3] = "50";
    expect(countFilled(inputs)).toBe(2);
  });
});
