export interface Contribution {
  hole: number;
  mass_g: number;
  x_g: number;
  y_g: number;
  x_display: string;
  y_display: string;
}

export interface BalanceSuggestion {
  hole: number;
  mass_g: number;
  predicted_residual_g: number;
  predicted_residual_display: string;
}

export interface OperatingConditionResult {
  /** 本次核验使用的转速（转/分钟） */
  speed_rpm: number;
  /** 本次核验使用的转子有效半径（毫米） */
  radius_mm: number;
  /** 未舍入离心力（牛顿） */
  centrifugal_force_n: number;
  /** 两位小数展示值 */
  centrifugal_force_display: string;
}

export interface VerifyResponse {
  balanced: boolean;
  verdict: string;
  threshold_g: number;
  residual_g: number;
  residual_display: string;
  direction_deg: number | null;
  direction_display: string;
  x_g: number;
  y_g: number;
  x_display: string;
  y_display: string;
  contributions: Contribution[];
  /** 仅“拒绝且存在一次加管即可放行的候选”时非空 */
  suggestion: BalanceSuggestion | null;
  /** 仅在请求带完整工况（转速 + 有效半径）时非空 */
  condition: OperatingConditionResult | null;
}
