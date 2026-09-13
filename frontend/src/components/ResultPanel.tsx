import type {
  BalanceSuggestion,
  OppositeDifference,
  VerifyResponse,
} from "../types";

interface ResultPanelProps {
  result: VerifyResponse | null;
  onApplySuggestion?: (suggestion: BalanceSuggestion) => void;
  /** 点选对置差异诊断中的某一对；再次点选同一对可取消 */
  onSelectPair?: (pair: OppositeDifference) => void;
  /** 当前高亮对置孔对的较小孔号；null 表示未选择 */
  selectedFirstHole?: number | null;
}

/** 拒绝面板展示差异最大的前三对 */
const TOP_PAIR_COUNT = 3;

function pairBiasHint(pair: OppositeDifference): string {
  if (pair.delta_g > 0) {
    return `孔 ${pair.first_hole} 偏重`;
  }
  if (pair.delta_g < 0) {
    return `孔 ${pair.opposite_hole} 偏重`;
  }
  return "对置等质量";
}

export function ResultPanel({
  result,
  onApplySuggestion,
  onSelectPair,
  selectedFirstHole,
}: ResultPanelProps) {
  if (!result) {
    return (
      <section className="result-panel empty" data-testid="result-empty">
        <p>录入各孔质量（可选填转速与有效半径）后点击「核验」。结论仅此一处显示，修改任何孔位或工况后自动清除。</p>
      </section>
    );
  }

  return (
    <section className="result-panel" data-testid="result-panel">
      <div
        className={`verdict ${result.balanced ? "pass" : "fail"}`}
        data-testid="verdict"
      >
        {result.verdict}
      </div>

      {result.condition && (
        <div className="condition-result" data-testid="condition-result">
          <span className="condition-item" data-testid="condition-speed">
            转速 <strong>{result.condition.speed_rpm}</strong> 转/分钟
          </span>
          <span className="condition-item" data-testid="condition-radius">
            有效半径 <strong>{result.condition.radius_mm}</strong> mm
          </span>
          <span className="condition-item" data-testid="centrifugal-force">
            离心力{" "}
            <strong>{result.condition.centrifugal_force_display}</strong> N
          </span>
          <span className="condition-note">
            离心力仅供评估工况严重程度，放行仍以残余量 {result.threshold_g.toFixed(2)} g
            阈值为准
          </span>
        </div>
      )}

      {!result.balanced &&
        (result.suggestion ? (
          <div className="suggestion" data-testid="suggestion">
            <p className="suggestion-text">
              配平建议：在空孔 <strong>{result.suggestion.hole}</strong> 加入{" "}
              <strong>{result.suggestion.mass_g} g</strong> 试管，预测残余量{" "}
              <strong>{result.suggestion.predicted_residual_display} g</strong>
            </p>
            <button
              type="button"
              className="primary"
              data-testid="apply-suggestion"
              onClick={() => onApplySuggestion?.(result.suggestion!)}
            >
              应用建议
            </button>
          </div>
        ) : (
          <p className="suggestion-none" data-testid="suggestion-none">
            无法通过单支试管（1–500 g）配平，请调整现有试管后重新核验。
          </p>
        ))}

      {!result.balanced &&
        Array.isArray(result.opposite_differences) &&
        result.opposite_differences.length > 0 && (
          <div className="opposite-diagnostics" data-testid="opposite-diagnostics">
            <p className="opposite-title">
              对置差异诊断：差异最大的三对，点选后在转子图高亮对应两孔
            </p>
            <ul>
              {result.opposite_differences.slice(0, TOP_PAIR_COUNT).map((pair) => {
                const selected = selectedFirstHole === pair.first_hole;
                return (
                  <li key={pair.first_hole}>
                    <button
                      type="button"
                      className={`pair-row${selected ? " selected" : ""}`}
                      data-testid={`opposite-pair-${pair.first_hole}`}
                      aria-pressed={selected}
                      onClick={() => onSelectPair?.(pair)}
                    >
                      <span className="pair-holes">
                        孔 {pair.first_hole}（{pair.first_mass_g} g）↔ 孔{" "}
                        {pair.opposite_hole}（{pair.opposite_mass_g} g）
                      </span>
                      <span className="pair-delta" data-testid={`pair-delta-${pair.first_hole}`}>
                        差 {pair.delta_g > 0 ? "+" : ""}
                        {pair.delta_display} g
                      </span>
                      <span className="pair-contrib">
                        X {pair.x_display} / Y {pair.y_display}
                      </span>
                      <span className="pair-hint">{pairBiasHint(pair)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

      <dl className="summary">
        <div>
          <dt>残余量</dt>
          <dd>
            <span data-testid="residual">{result.residual_display}</span> g
          </dd>
        </div>
        <div>
          <dt>放行阈值</dt>
          <dd>
            <span data-testid="threshold">{result.threshold_g.toFixed(2)}</span> g
          </dd>
        </div>
        <div>
          <dt>合成方向</dt>
          <dd data-testid="direction">
            {result.direction_display === "无"
              ? "无"
              : `${result.direction_display}°`}
          </dd>
        </div>
        <div>
          <dt>X 分量</dt>
          <dd>
            <span data-testid="total-x">{result.x_display}</span> g
          </dd>
        </div>
        <div>
          <dt>Y 分量</dt>
          <dd>
            <span data-testid="total-y">{result.y_display}</span> g
          </dd>
        </div>
      </dl>

      <table className="contributions" data-testid="contributions">
        <thead>
          <tr>
            <th>孔位</th>
            <th>质量 (g)</th>
            <th>X 贡献 (g)</th>
            <th>Y 贡献 (g)</th>
          </tr>
        </thead>
        <tbody>
          {result.contributions.map((c) => (
            <tr key={c.hole} data-testid={`contribution-${c.hole}`}>
              <td>{c.hole}</td>
              <td>{c.mass_g}</td>
              <td>{c.x_display}</td>
              <td>{c.y_display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
