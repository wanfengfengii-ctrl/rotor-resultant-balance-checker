export const HOLE_COUNT = 12;

export interface TubePayload {
  hole: number;
  mass_g: number;
}

export interface BuildResult {
  /** 提交给 API 的非空孔（每孔至多一次） */
  tubes: TubePayload[];
  /** tubes[i] 对应的孔位编号，用于把 422 错误映射回输入框 */
  holes: number[];
  /** 前端即可判定的录入错误（非整数），键为孔位编号 */
  fieldErrors: Record<number, string>;
}

const INTEGER_PATTERN = /^[+-]?\d+$/;

/**
 * 把 12 个输入框的原始字符串整理成 API 载荷。
 * 空孔（留空、纯空白或 0）按 0 克处理，不进入载荷；
 * 非整数输入不提交，直接以逐字段错误提示；
 * 越界（如 501、负数）仍交给 API 判定，以展示后端逐字段错误。
 */
export function buildTubes(inputs: string[]): BuildResult {
  const tubes: TubePayload[] = [];
  const holes: number[] = [];
  const fieldErrors: Record<number, string> = {};

  inputs.forEach((raw, hole) => {
    const text = raw.trim();
    if (text === "") {
      return; // 空孔按 0 克
    }
    if (!INTEGER_PATTERN.test(text)) {
      fieldErrors[hole] = "请输入整数克数";
      return;
    }
    const mass = Number.parseInt(text, 10);
    if (mass === 0) {
      return; // 0 克视为空孔
    }
    tubes.push({ hole, mass_g: mass });
    holes.push(hole);
  });

  return { tubes, holes, fieldErrors };
}

/** 有效录入（非空且为整数、非 0）的试管数量，用于界面提示。 */
export function countFilled(inputs: string[]): number {
  return buildTubes(inputs).tubes.length;
}
