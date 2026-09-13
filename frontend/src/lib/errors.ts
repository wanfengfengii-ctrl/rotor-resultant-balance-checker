/** API 校验错误（HTTP 422）的解析与逐字段映射。 */

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

/**
 * 把 422 detail 列表映射回孔位。
 * FastAPI 的 loc 形如 ["body", "tubes", <下标>, <字段>]；
 * 无法定位到具体孔位的错误（如“孔位重复”“至少需要两支试管”）归入 generalErrors。
 */
export function mapValidationErrors(
  details: ApiErrorDetail[],
  submittedHoles: number[],
): MappedErrors {
  const fieldErrors: Record<number, string> = {};
  const generalErrors: string[] = [];

  for (const detail of details) {
    const loc = Array.isArray(detail.loc) ? detail.loc : [];
    const tubesAt = loc.indexOf("tubes");
    const index = tubesAt >= 0 ? loc[tubesAt + 1] : undefined;
    const hole = typeof index === "number" ? submittedHoles[index] : undefined;
    const message = translateMessage(detail.msg);
    if (hole !== undefined) {
      fieldErrors[hole] = message;
    } else {
      generalErrors.push(message);
    }
  }

  if (details.length === 0) {
    generalErrors.push("请求未通过服务端校验");
  }
  return { fieldErrors, generalErrors };
}
