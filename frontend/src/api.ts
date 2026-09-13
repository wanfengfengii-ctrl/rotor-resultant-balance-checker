import { ApiValidationError } from "./lib/errors";
import type { ConditionPayload } from "./lib/condition";
import type { TubePayload } from "./lib/rotor";
import type { VerifyResponse } from "./types";

const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? "";

/**
 * 调用后端核验接口；422 抛出 ApiValidationError，其余非 2xx 抛出普通 Error。
 * condition 为两项工况填写完整且合法时携带，否则省略（按原方式核验）。
 */
export async function verifyRotor(
  tubes: TubePayload[],
  condition?: ConditionPayload | null,
): Promise<VerifyResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(condition ? { tubes, condition } : { tubes }),
    });
  } catch {
    throw new Error("无法连接核验服务，请确认后端已启动");
  }

  if (response.status === 422) {
    const body = (await response.json()) as { detail?: unknown };
    const details = Array.isArray(body.detail) ? body.detail : [];
    throw new ApiValidationError(details);
  }
  if (!response.ok) {
    throw new Error(`核验服务异常（HTTP ${response.status}）`);
  }
  return (await response.json()) as VerifyResponse;
}
