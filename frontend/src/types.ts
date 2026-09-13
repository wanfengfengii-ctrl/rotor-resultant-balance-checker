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
}
