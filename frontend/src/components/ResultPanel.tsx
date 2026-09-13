import type { VerifyResponse } from "../types";

interface ResultPanelProps {
  result: VerifyResponse | null;
}

export function ResultPanel({ result }: ResultPanelProps) {
  if (!result) {
    return (
      <section className="result-panel empty" data-testid="result-empty">
        <p>录入各孔质量后点击「核验」。结论仅此一处显示，修改任何孔位后自动清除。</p>
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
