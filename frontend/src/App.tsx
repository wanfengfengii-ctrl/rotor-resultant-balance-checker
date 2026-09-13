import { useCallback, useMemo, useRef, useState } from "react";
import { verifyRotor } from "./api";
import { RotorView } from "./components/RotorView";
import { ResultPanel } from "./components/ResultPanel";
import { ApiValidationError, mapValidationErrors } from "./lib/errors";
import { buildTubes, countFilled, HOLE_COUNT } from "./lib/rotor";
import type { BalanceSuggestion, VerifyResponse } from "./types";

export default function App() {
  const [inputs, setInputs] = useState<string[]>(() => Array(HOLE_COUNT).fill(""));
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<number, string>>({});
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  // 载荷版本号：任何录入修改都同步递增（ref 不等待重渲染）。
  // 核验响应返回时若版本已变，说明载荷在飞行途中被改过，
  // 该次响应（结论 / 建议 / 422 错误）一律作废，以当前载荷重新核验为准。
  const loadVersionRef = useRef(0);

  // 修改任何孔位：立即清除旧结论与旧错误，绝不沿用上一次放行结果
  const handleChange = useCallback((hole: number, value: string) => {
    loadVersionRef.current += 1;
    setInputs((prev) => prev.map((v, i) => (i === hole ? value : v)));
    setResult(null);
    setFieldErrors({});
    setGeneralErrors([]);
  }, []);

  const handleClear = useCallback(() => {
    loadVersionRef.current += 1;
    setInputs(Array(HOLE_COUNT).fill(""));
    setResult(null);
    setFieldErrors({});
    setGeneralErrors([]);
  }, []);

  // 应用配平建议：把建议质量写入对应空孔并清除旧结论，
  // 最终结论仍由操作员点击「核验」产生。
  // 建议目标孔已被占用时旧建议失效：不得覆盖当前录入。
  const handleApplySuggestion = useCallback((suggestion: BalanceSuggestion) => {
    loadVersionRef.current += 1;
    setInputs((prev) => {
      const current = prev[suggestion.hole].trim();
      if (current !== "" && current !== "0") {
        return prev; // 孔位已占用，拒绝覆盖
      }
      return prev.map((v, i) =>
        i === suggestion.hole ? String(suggestion.mass_g) : v,
      );
    });
    setResult(null);
    setFieldErrors({});
    setGeneralErrors([]);
  }, []);

  const handleSubmit = useCallback(async () => {
    // 每次提交都先清空旧结论：失败时只显示错误
    setResult(null);
    setFieldErrors({});
    setGeneralErrors([]);

    const { tubes, holes, fieldErrors: localErrors } = buildTubes(inputs);
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    setPending(true);
    // 记录提交时的载荷版本；响应返回时版本不一致即视为过期响应
    const submittedVersion = loadVersionRef.current;
    try {
      const response = await verifyRotor(tubes);
      if (loadVersionRef.current !== submittedVersion) {
        return; // 载荷已在等待期间修改：丢弃迟到的结论与建议
      }
      setResult(response);
    } catch (error) {
      if (loadVersionRef.current !== submittedVersion) {
        return; // 同上：过期的校验错误不得挂到当前录入上
      }
      if (error instanceof ApiValidationError) {
        const mapped = mapValidationErrors(error.details, holes);
        setFieldErrors(mapped.fieldErrors);
        setGeneralErrors(mapped.generalErrors);
      } else {
        setGeneralErrors([
          error instanceof Error ? error.message : "未知错误",
        ]);
      }
    } finally {
      setPending(false);
    }
  }, [inputs]);

  const filled = useMemo(() => countFilled(inputs), [inputs]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>十二孔离心转子偏载核验台</h1>
        <p className="subtitle">
          孔位 0–11 顺时针排布，空孔按 0 克处理；残余量 ≤ 5.00 g 放行，否则拒绝
        </p>
      </header>

      <main className="layout">
        <section className="rotor-section">
          <RotorView
            inputs={inputs}
            fieldErrors={fieldErrors}
            result={result}
            onChange={handleChange}
          />
          <div className="controls">
            <button
              type="button"
              className="primary"
              data-testid="submit"
              onClick={handleSubmit}
              disabled={pending}
            >
              {pending ? "核验中…" : "核验"}
            </button>
            <button type="button" onClick={handleClear} disabled={pending}>
              清空
            </button>
            <span className="filled-count" data-testid="filled-count">
              已录入 {filled} 支试管
            </span>
          </div>
          {generalErrors.length > 0 && (
            <div className="error-banner" data-testid="general-errors" role="alert">
              {generalErrors.map((message, index) => (
                <p key={index}>{message}</p>
              ))}
            </div>
          )}
        </section>

        <ResultPanel result={result} onApplySuggestion={handleApplySuggestion} />
      </main>
    </div>
  );
}
