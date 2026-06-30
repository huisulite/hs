import type { PhoneRecord } from "@/types";

const phonePattern = /^\+?(\d{1,4})?[\s-]*(\d{6,15})$/;

export function parsePhoneRows(input: string, defaultCountryCode = "86"): PhoneRecord[] {
  const fallbackCountryCode = normalizeCountryCode(defaultCountryCode) || "86";
  const rows = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return rows.map((line, index) => {
    const [phonePart, apiPart = ""] = line.split(/\s*-{4}\s*/).map((item) => item.trim());
    const columns = phonePart.split(/[,	，\s]+/).map((item) => item.trim()).filter(Boolean);
    let countryCode = fallbackCountryCode;
    let phone = columns[0] ?? "";

    if (columns.length >= 2 && /^\+?\d{1,4}$/.test(columns[0]) && /^\d{6,15}$/.test(columns[1])) {
      countryCode = columns[0].replace(/^\+/, "");
      phone = columns[1];
    } else {
      const normalized = phonePart.replace(/[()]/g, "").replace(/^\+/, "");
      const match = normalized.match(phonePattern);
      if (match) {
        const digits = normalized.replace(/\D/g, "");
        if (digits.length > fallbackCountryCode.length + 5 && digits.startsWith(fallbackCountryCode)) {
          countryCode = fallbackCountryCode;
          phone = digits.slice(fallbackCountryCode.length);
        } else if (digits.length > 11) {
          countryCode = digits.slice(0, digits.length - 11);
          phone = digits.slice(-11);
        } else {
          phone = digits;
        }
      }
    }

    return {
      id: `${Date.now()}-${index}-${phone}`,
      countryCode,
      phone,
      api: apiPart,
      result: "",
      status: isValidPhone(phone) ? "pending" : "failed",
      attempts: 0,
      error: isValidPhone(phone) ? undefined : "手机号格式无效",
    };
  });
}

export function isValidPhone(phone: string): boolean {
  return /^\d{6,15}$/.test(phone);
}

function normalizeCountryCode(countryCode: string): string {
  return countryCode.replace(/\D/g, "").slice(0, 4);
}

export function toCsv(records: PhoneRecord[]): string {
  const header = ["区号", "手机号", "API", "返回数字", "状态", "请求次数", "最后请求时间", "错误"];
  const body = records.map((record) => [
    record.countryCode,
    record.phone,
    record.api,
    record.result,
    record.status,
    String(record.attempts),
    record.lastRequestedAt ?? "",
    record.error ?? "",
  ]);

  return [header, ...body]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
}
