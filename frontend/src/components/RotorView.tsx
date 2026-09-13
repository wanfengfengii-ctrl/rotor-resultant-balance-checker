import type { VerifyResponse } from "../types";
import { HOLE_COUNT } from "../lib/rotor";

interface RotorViewProps {
  inputs: string[];
  fieldErrors: Record<number, string>;
  result: VerifyResponse | null;
  onChange: (hole: number, value: string) => void;
}

/** 孔位展示半径（占容器宽度的百分比），0 号孔在正上方，编号顺时针递增 */
const HOLE_RADIUS_PERCENT = 38;
/** SVG 用户单位与百分比的换算：viewBox 为 ±110，容器半宽为 110 单位 */
const SVG_RADIUS = (HOLE_RADIUS_PERCENT / 50) * 110;
const ARROW_MAX = 62;

function holePosition(hole: number): { left: string; top: string } {
  const rad = (30 * hole * Math.PI) / 180;
  const left = 50 + HOLE_RADIUS_PERCENT * Math.sin(rad);
  const top = 50 - HOLE_RADIUS_PERCENT * Math.cos(rad);
  return { left: `${left}%`, top: `${top}%` };
}

export function RotorView({ inputs, fieldErrors, result, onChange }: RotorViewProps) {
  // 物理分量 (X, Y) → 屏幕 (Y, −X)：与“0 号孔在正上方、编号顺时针”的排布保持一致
  let arrow: { x: number; y: number } | null = null;
  if (result && result.direction_deg !== null && result.residual_g > 0) {
    const scale = ARROW_MAX / result.residual_g;
    arrow = { x: result.y_g * scale, y: -result.x_g * scale };
  }

  return (
    <div className="rotor" data-testid="rotor">
      <svg className="rotor-svg" viewBox="-110 -110 220 220" aria-hidden="true">
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L7,3 L0,6 Z" />
          </marker>
        </defs>
        <circle className="rotor-ring" cx="0" cy="0" r={SVG_RADIUS} />
        {Array.from({ length: HOLE_COUNT }, (_, k) => {
          const rad = (30 * k * Math.PI) / 180;
          return (
            <circle
              key={k}
              className="rotor-dot"
              cx={SVG_RADIUS * Math.sin(rad)}
              cy={-SVG_RADIUS * Math.cos(rad)}
              r="3"
            />
          );
        })}
        {arrow && (
          <line
            data-testid="resultant-arrow"
            className={`resultant ${result?.balanced ? "pass" : "fail"}`}
            x1="0"
            y1="0"
            x2={arrow.x}
            y2={arrow.y}
            markerEnd="url(#arrowhead)"
          />
        )}
        <circle className="rotor-hub" cx="0" cy="0" r="4" />
      </svg>

      {result && (
        <div
          className={`rotor-center ${result.balanced ? "pass" : "fail"}`}
          data-testid="rotor-center"
        >
          <strong>{result.verdict}</strong>
          <span>{result.residual_display} g</span>
        </div>
      )}

      {Array.from({ length: HOLE_COUNT }, (_, k) => {
        const error = fieldErrors[k];
        const filled = inputs[k].trim() !== "" && inputs[k].trim() !== "0";
        return (
          <div
            key={k}
            className={`hole${filled ? " filled" : ""}${error ? " has-error" : ""}`}
            style={holePosition(k)}
            data-testid={`hole-${k}`}
          >
            <label htmlFor={`mass-input-${k}`}>孔 {k}</label>
            <input
              id={`mass-input-${k}`}
              data-testid={`mass-input-${k}`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="空"
              value={inputs[k]}
              aria-invalid={error ? true : undefined}
              onChange={(event) => onChange(k, event.target.value)}
            />
            {error && (
              <span className="field-error" data-testid={`error-${k}`} role="alert">
                {error}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
