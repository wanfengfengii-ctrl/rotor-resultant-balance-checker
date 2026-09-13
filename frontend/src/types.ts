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

export interface OppositeDifference {
  /** 对置孔中较小的孔号（0–5） */
  first_hole: number;
  /** 对置孔中较大的孔号（6–11，恰为 first_hole + 6） */
  opposite_hole: number;
  /** 前者质量（空孔为 0） */
  first_mass_g: number;
  /** 对面质量（空孔为 0） */
  opposite_mass_g: number;
  /** 有符号差值：前者质量减后者质量 */
  delta_g: number;
  delta_display: string;
  /** 该差值在前者孔位角度上形成的 X / Y 贡献（克，未舍入） */
  x_g: number;
  y_g: number;
  x_display: string;
  y_display: string;
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
  /** 对置差异诊断：仅拒绝时给出（六对，按绝对差降序）；放行或旧版响应缺省 */
  opposite_differences?: OppositeDifference[] | null;
}
