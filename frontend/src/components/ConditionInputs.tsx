import type { ConditionField } from "../lib/condition";

interface ConditionInputsProps {
  speed: string;
  radius: string;
  errors: Partial<Record<ConditionField, string>>;
  onChange: (field: ConditionField, value: string) => void;
}

/**
 * 可选工况录入：转速（转/分钟）与转子有效半径（毫米）。
 * 两项均留空时按原方式核验；只填一项或输入非法时错误定位到对应输入框。
 * 修改任一项与修改孔位一样会立即清除旧结论（由父组件保证）。
 */
export function ConditionInputs({
  speed,
  radius,
  errors,
  onChange,
}: ConditionInputsProps) {
  return (
    <div className="condition" data-testid="condition-inputs">
      <div className={`condition-field${errors.speed_rpm ? " has-error" : ""}`}>
        <label htmlFor="speed-input">转速（转/分钟，可选）</label>
        <input
          id="speed-input"
          data-testid="speed-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="100–30000"
          value={speed}
          aria-invalid={errors.speed_rpm ? true : undefined}
          onChange={(event) => onChange("speed_rpm", event.target.value)}
        />
        {errors.speed_rpm && (
          <span className="field-error" data-testid="speed-error" role="alert">
            {errors.speed_rpm}
          </span>
        )}
      </div>
      <div className={`condition-field${errors.radius_mm ? " has-error" : ""}`}>
        <label htmlFor="radius-input">有效半径（毫米，可选）</label>
        <input
          id="radius-input"
          data-testid="radius-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="10–500"
          value={radius}
          aria-invalid={errors.radius_mm ? true : undefined}
          onChange={(event) => onChange("radius_mm", event.target.value)}
        />
        {errors.radius_mm && (
          <span className="field-error" data-testid="radius-error" role="alert">
            {errors.radius_mm}
          </span>
        )}
      </div>
      <p className="condition-hint">
        两项同时填写后随核验一并计算离心力；均留空则仅做偏载核验。
      </p>
    </div>
  );
}
