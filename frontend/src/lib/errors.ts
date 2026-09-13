/** API 校验错误（HTTP 422）的解析与逐字段映射。 */

import type { ConditionField } from "./condition";

export interface ApiErrorDetail {
  loc: Array<string | number>;
  msg: string;
  type: string;
}

export class ApiValidationError extends Error {
  readonly details: ApiErrorDetail[];

  constructor(details: ApiErrorDetail[]) {
    super("请求未通过服务端校验");
    this.name = "ApiValidationError";
    this.details = details;
  }
}

export interface MappedErrors {
  /** 键为孔位编号 */
  fieldErrors: Record<number, string>;
  /** 键为工况字段（转速 / 有效半径） */
  conditionErrors: Partial<Record<ConditionField, string>>;
  generalErrors: string[];
}

const TRANSLATIONS: Array<[RegExp, string]> = [
  [/valid integer/i, "必须为整数"],
  [/Input should be/i, "输入格式不合法"],
  [/Field required/i, "缺少必填字段"],
  [/valid list/i, "试管列表格式不合法"],
];

/** 把 Pydantic 的英文信息翻译为操作员可读的中文；后端自定义中文信息原样保留。 */
export function translateMessage(msg: string): string {
  for (const [pattern, zh] of TRANSLATIONS) {
    if (pattern.test(msg)) {
      return zh;
    }
  }
  return msg;
}

const CONDITION_FIELDS: ReadonlySet<string> = new Set(["speed_rpm", "radius_mm"]);

/**
 * 把 422 detail 列表映射回输入位置。
 * FastAPI 的 loc 形如 ["body", "tubes", <下标>, <字段>]；
 * 工况错误形如 ["body", "condition", <字段>]。
 * 无法定位到具体孔位或工况字段的错误（如“孔位重复”“至少需要两支试管”）
 * 归入 generalErrors。
 */
export function mapValidationErrors(
  details: ApiErrorDetail[],
  submittedHoles: number[],
): MappedErrors {
  const fieldErrors: Record<number, string> = {};
  const conditionErrors: Partial<Record<ConditionField, string>> = {};
  const generalErrors: string[] = [];

  for (const detail of details) {
    const loc = Array.isArray(detail.loc) ? detail.loc : [];
    const message = translateMessage(detail.msg);

    const tubesAt = loc.indexOf("tubes");
    const conditionAt = loc.indexOf("condition");

    if (tubesAt >= 0) {
      const index = loc[tubesAt + 1];
      const hole = typeof index === "number" ? submittedHoles[index] : undefined;
      if (hole !== undefined) {
        fieldErrors[hole] = message;
      } else {
        generalErrors.push(message);
      }
    } else if (conditionAt >= 0) {
      const field = loc[conditionAt + 1];
      if (typeof field === "string" && CONDITION_FIELDS.has(field)) {
        conditionErrors[field as ConditionField] = message;
      } else {
        generalErrors.push(message);
      }
    } else {
      generalErrors.push(message);
    }
  }

  if (details.length === 0) {
    generalErrors.push("请求未通过服务端校验");
  }
  return { fieldErrors, conditionErrors, generalErrors };
}
