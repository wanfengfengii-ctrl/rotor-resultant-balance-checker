/** 可选称量误差（每支试管统一，克）的录入整理与校验。 */

export const MIN_WEIGHING_ERROR_G = 0;
export const MAX_WEIGHING_ERROR_G = 5;
export const WEIGHING_ERROR_MAX_DECIMALS = 2;

export interface WeighingErrorBuildResult {
  /** 留空时为 null（请求省略误差，不做误差评估） */
  value: number | null;
  /** 校验错误；合法或留空时无 */
  error?: string;
}

const NUMBER_PATTERN = /^[+-]?\d+(\.\d+)?$/;

/**
 * 整理称量误差输入：
 * - 留空（或纯空白）→ 不带误差（value 为 null），保持原有核验行为；
 * - 非数字 → 错误定位到误差输入框；
 * - 超过两位小数或超出 0–5 克 → 错误定位到误差输入框。
 * 非法值只产生字段反馈，录入框内容保持原样（由调用方保证不清空输入）。
 */
export function buildWeighingError(raw: string): WeighingErrorBuildResult {
  const text = raw.trim();
  if (text === "") {
    return { value: null };
  }
  if (!NUMBER_PATTERN.test(text)) {
    return { value: null, error: "称量误差必须为数字" };
  }
  const decimals = text.split(".")[1]?.length ?? 0;
  if (decimals > WEIGHING_ERROR_MAX_DECIMALS) {
    return {
      value: null,
      error: "称量误差最多两位小数",
    };
  }
  const value = Number.parseFloat(text);
  if (value < MIN_WEIGHING_ERROR_G || value > MAX_WEIGHING_ERROR_G) {
    return {
      value: null,
      error: `称量误差必须在 ${MIN_WEIGHING_ERROR_G} 至 ${MAX_WEIGHING_ERROR_G} 克之间`,
    };
  }
  return { value };
}
