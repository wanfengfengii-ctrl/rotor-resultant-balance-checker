/** 可选工况参数（转速 + 转子有效半径）的录入整理与校验。 */

export const MIN_SPEED_RPM = 100;
export const MAX_SPEED_RPM = 30000;
export const MIN_RADIUS_MM = 10;
export const MAX_RADIUS_MM = 500;

export interface ConditionPayload {
  speed_rpm: number;
  radius_mm: number;
}

export type ConditionField = "speed_rpm" | "radius_mm";

export interface ConditionBuildResult {
  /** 两项都留空时为 null（按原方式核验，不带工况） */
  condition: ConditionPayload | null;
  /** 校验错误，键为对应工况字段；成对填写且合法时为空 */
  errors: Partial<Record<ConditionField, string>>;
}

const INTEGER_PATTERN = /^[+-]?\d+$/;

/** 解析单个工况输入：空白 / 非整数 / 越界分别给出错误；空字符串单独标记。 */
function parseField(
  raw: string,
  min: number,
  max: number,
  unit: string,
  notIntegerMessage: string,
): { value: number | null; error?: string } {
  const text = raw.trim();
  if (text === "") {
    return { value: null };
  }
  if (!INTEGER_PATTERN.test(text)) {
    return { value: null, error: notIntegerMessage };
  }
  const value = Number.parseInt(text, 10);
  if (value < min || value > max) {
    return { value: null, error: `必须在 ${min} 至 ${max} ${unit}之间` };
  }
  return { value };
}

/**
 * 整理两项工况输入：
 * - 两项均留空 → 不带工况（condition 为 null），保持原有核验行为；
 * - 仅填一项 → 两项都提示需要成对填写，错误定位到各自输入框；
 * - 非整数或越界 → 错误只定位到对应工况输入框。
 */
export function buildCondition(
  speedRaw: string,
  radiusRaw: string,
): ConditionBuildResult {
  const speed = parseField(
    speedRaw,
    MIN_SPEED_RPM,
    MAX_SPEED_RPM,
    "转/分钟",
    "转速必须为整数",
  );
  const radius = parseField(
    radiusRaw,
    MIN_RADIUS_MM,
    MAX_RADIUS_MM,
    "毫米",
    "有效半径必须为整数",
  );

  const speedEmpty = speed.value === null && speed.error === undefined;
  const radiusEmpty = radius.value === null && radius.error === undefined;

  if (speedEmpty && radiusEmpty) {
    return { condition: null, errors: {} };
  }

  const errors: Partial<Record<ConditionField, string>> = {};
  if (speed.error) {
    errors.speed_rpm = speed.error;
  }
  if (radius.error) {
    errors.radius_mm = radius.error;
  }
  // 只填一项：两项都需要配对，错误定位到对应（未填 / 已填）的输入框
  if (speedEmpty) {
    errors.speed_rpm = `需与有效半径同时填写（${MIN_SPEED_RPM}–${MAX_SPEED_RPM} 转/分钟）`;
  }
  if (radiusEmpty) {
    errors.radius_mm = `需与转速同时填写（${MIN_RADIUS_MM}–${MAX_RADIUS_MM} 毫米）`;
  }

  if (errors.speed_rpm || errors.radius_mm) {
    return { condition: null, errors };
  }
  return {
    condition: {
      speed_rpm: speed.value as number,
      radius_mm: radius.value as number,
    },
    errors: {},
  };
}
