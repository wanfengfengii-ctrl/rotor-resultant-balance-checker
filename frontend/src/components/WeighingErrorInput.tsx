interface WeighingErrorInputProps {
  value: string;
  /** 字段校验反馈（本地或后端 422 映射）；展示期间录入内容保持原样 */
  error?: string | null;
  onChange: (value: string) => void;
}

/**
 * 可选称量误差录入：每支试管统一的标称误差（克，0–5、最多两位小数）。
 * 留空时按原方式核验（响应不含误差评估）；
 * 修改该输入与修改孔位一样会立即清除旧结论（由父组件保证）。
 */
export function WeighingErrorInput({
  value,
  error,
  onChange,
}: WeighingErrorInputProps) {
  return (
    <div className="weighing-error" data-testid="weighing-error-inputs">
      <div className={`condition-field${error ? " has-error" : ""}`}>
        <label htmlFor="weighing-error-input">称量误差（克/支，可选）</label>
        <input
          id="weighing-error-input"
          data-testid="weighing-error-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0–5，最多两位小数"
          value={value}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {error && (
          <span
            className="field-error"
            data-testid="weighing-error-error"
            role="alert"
          >
            {error}
          </span>
        )}
      </div>
      <p className="condition-hint">
        填写后按 试管数×误差 给出残余量可信区间与复称提示；留空则仅按名义残余量判定。
      </p>
    </div>
  );
}
