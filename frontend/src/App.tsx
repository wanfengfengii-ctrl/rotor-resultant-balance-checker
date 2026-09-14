import { useCallback, useMemo, useRef, useState } from "react";
import { verifyRotor } from "./api";
import { RotorView } from "./components/RotorView";
import { ResultPanel } from "./components/ResultPanel";
import { ConditionInputs } from "./components/ConditionInputs";
import { ApiValidationError, mapValidationErrors } from "./lib/errors";
import {
  buildCondition,
  type ConditionField,
} from "./lib/condition";
import { buildTubes, countFilled, HOLE_COUNT } from "./lib/rotor";
import type {
  BalanceSuggestion,
  OppositeDifference,
  VerifyResponse,
} from "./types";

export default function App() {
  const [inputs, setInputs] = useState<string[]>(() => Array(HOLE_COUNT).fill(""));
  // 可选工况：转速与有效半径；应用建议与重新核验期间均保留，清空时才复位
  const [speedInput, setSpeedInput] = useState("");
  const [radiusInput, setRadiusInput] = useState("");
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<number, string>>({});
  const [conditionErrors, setConditionErrors] = useState<
    Partial<Record<ConditionField, string>>
  >({});
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  // 对置差异诊断中被点选的孔对（以较小孔号标识）；随旧结果在任何录入修改、
  // 应用建议、重新提交或请求失败时一起清除，绝不跨结果保留高亮
  const [selectedPairHole, setSelectedPairHole] = useState<number | null>(null);
  // 载荷版本号：任何录入修改（孔位或工况）都同步递增（ref 不等待重渲染）。
  // 核验响应返回时若版本已变，说明载荷在飞行途中被改过，
  // 该次响应（结论 / 建议 / 422 错误）一律作废，以当前载荷重新核验为准。
  const loadVersionRef = useRef(0);

  // 修改任何孔位：立即清除旧结论与旧错误，绝不沿用上一次放行结果；
  // 同时结束「核验中」状态（在途响应由版本号机制作废），允许立即重新核验
  const handleChange = useCallback((hole: number, value: string) => {
    loadVersionRef.current += 1;
    setInputs((prev) => prev.map((v, i) => (i === hole ? value : v)));
    setResult(null);
    setSelectedPairHole(null);
    setFieldErrors({});
    setConditionErrors({});
    setGeneralErrors([]);
    setPending(false);
  }, []);

  // 修改工况参数与修改孔位同效：旧结论与旧离心力立即清除
  const handleConditionChange = useCallback(
    (field: ConditionField, value: string) => {
      loadVersionRef.current += 1;
      if (field === "speed_rpm") {
        setSpeedInput(value);
      } else {
        setRadiusInput(value);
      }
      setResult(null);
      setSelectedPairHole(null);
      setFieldErrors({});
      setConditionErrors({});
      setGeneralErrors([]);
      setPending(false);
    },
    [],
  );

  const handleClear = useCallback(() => {
    loadVersionRef.current += 1;
    setInputs(Array(HOLE_COUNT).fill(""));
    setSpeedInput("");
    setRadiusInput("");
    setResult(null);
    setSelectedPairHole(null);
    setFieldErrors({});
    setConditionErrors({});
    setGeneralErrors([]);
    setPending(false);
  }, []);

  // 应用配平建议：把建议质量写入对应空孔并清除旧结论，
  // 最终结论仍由操作员点击「核验」产生。
  // 建议目标孔已被占用时旧建议失效：不得覆盖当前录入。
  // 工况参数（转速 / 有效半径）原样保留，供再次核验复用。
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
    setSelectedPairHole(null);
    setFieldErrors({});
    setConditionErrors({});
    setGeneralErrors([]);
    setPending(false);
  }, []);

  // 点选拒绝面板中的对置差异：转子图只高亮该对两孔；再次点选同一对取消高亮。
  // 高亮仅与当前拒绝结果绑定，任何使结果失效的操作都会在别处清除该状态。
  const handleSelectPair = useCallback((pair: OppositeDifference) => {
    setSelectedPairHole((prev) =>
      prev === pair.first_hole ? null : pair.first_hole,
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    // 每次提交都先清空旧结论：失败时只显示错误
    setResult(null);
    setSelectedPairHole(null);
    setFieldErrors({});
    setConditionErrors({});
    setGeneralErrors([]);

    const { tubes, holes, fieldErrors: localErrors } = buildTubes(inputs);
    const { condition, errors: localConditionErrors } = buildCondition(
      speedInput,
      radiusInput,
    );
    if (
      Object.keys(localErrors).length > 0 ||
      Object.keys(localConditionErrors).length > 0
    ) {
      setFieldErrors(localErrors);
      setConditionErrors(localConditionErrors);
      return;
    }

    setPending(true);
    // 记录提交时的载荷版本；响应返回时版本不一致即视为过期响应
    const submittedVersion = loadVersionRef.current;
    try {
      const response = await verifyRotor(tubes, condition);
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
        setConditionErrors(mapped.conditionErrors);
        setGeneralErrors(mapped.generalErrors);
      } else {
        setGeneralErrors([
          error instanceof Error ? error.message : "未知错误",
        ]);
      }
    } finally {
      // 载荷在等待期间被修改时，pending 已由修改处理器复位（可能已有新请求
      // 在途）；此处仅当版本未变才复位，避免在途的旧请求关掉新请求的状态
      if (loadVersionRef.current === submittedVersion) {
        setPending(false);
      }
    }
  }, [inputs, speedInput, radiusInput]);

  const filled = useMemo(() => countFilled(inputs), [inputs]);

  // 当前点选的孔对仅在当前结果的诊断中有效；结果失效后即为 null
  const selectedPair = useMemo(
    () =>
      result?.opposite_differences?.find(
        (pair) => pair.first_hole === selectedPairHole,
      ) ?? null,
    [result, selectedPairHole],
  );
  const highlightedHoles = useMemo<ReadonlySet<number> | null>(() => {
    if (!selectedPair) {
      return null;
    }
    return new Set<number>([
      selectedPair.first_hole,
      selectedPair.opposite_hole,
    ]);
  }, [selectedPair]);

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
            highlightedHoles={highlightedHoles}
            onChange={handleChange}
          />
          <ConditionInputs
            speed={speedInput}
            radius={radiusInput}
            errors={conditionErrors}
            onChange={handleConditionChange}
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
            <button type="button" onClick={handleClear}>
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

        <ResultPanel
          result={result}
          onApplySuggestion={handleApplySuggestion}
          onSelectPair={handleSelectPair}
          selectedFirstHole={selectedPairHole}
        />
      </main>
    </div>
  );
}
