import type { ApiConfig, PhoneRecord } from "@/types";

export function renderTemplate(template: string, record: PhoneRecord): string {
  const fullPhone = `${record.countryCode}${record.phone}`;
  return template
    .replace(/\{\{countryCode\}\}/g, record.countryCode)
    .replace(/\{\{phone\}\}/g, record.phone)
    .replace(/\{\{fullPhone\}\}/g, fullPhone);
}

export function buildRequest(config: ApiConfig, record: PhoneRecord): { url: string; init: RequestInit } {
  const endpoint = normalizeEndpoint(renderTemplate(record.api || config.endpoint, record));
  const headers = parseHeaders(config.headersText);
  const url = toProxyUrl(endpoint);

  if (config.method === "GET") {
    return { url, init: { method: "GET", headers } };
  }

  return {
    url,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: renderTemplate(config.requestTemplate, record),
    },
  };
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/^`|`$/g, "");
}

function toProxyUrl(endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) {
    return `/api/proxy?target=${encodeURIComponent(endpoint)}`;
  }
  return endpoint;
}

export function getByPath(data: unknown, path: string): unknown {
  if (!path.trim()) {
    return data;
  }

  return path.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, data);
}

export function extractNumber(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const text = String(value);
    return isLikelyYear(text) ? undefined : text;
  }
  if (typeof value === "string") {
    if (isNoCodeResponse(value)) {
      return undefined;
    }
    const segmentCode = extractCodeFromSegments(value);
    if (segmentCode) {
      return segmentCode;
    }
    const codeMatch = value.match(/(?:验证码|校验码|动态码|code|sms|otp)\D*(\d{4,8})/i);
    if (codeMatch?.[1]) {
      return codeMatch[1];
    }
    const compactCodeMatch = value.replace(/\s+/g, "").match(/(?:验证|码|code|sms|otp).*?(\d{4,8})/i);
    if (compactCodeMatch?.[1]) {
      return compactCodeMatch[1];
    }
    const likelyCodeMatches = value.match(/(?<!\d)\d{5,8}(?!\d)/g) ?? [];
    const likelyCode = likelyCodeMatches.find((item) => !isLikelyYear(item));
    if (likelyCode) {
      return likelyCode;
    }
    const match = value.match(/(?<!\d)\d{4}(?!\d)/);
    if (match?.[0] && !isLikelyYear(match[0])) {
      return match[0];
    }
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = extractNumber(item);
      if (result) {
        return result;
      }
    }
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    const priorityItems = entries
      .filter(([key]) => /code|验证码|sms|otp/i.test(key))
      .map(([, item]) => item);
    const otherItems = entries
      .filter(([key]) => !/code|验证码|sms|otp/i.test(key))
      .map(([, item]) => item);
    for (const item of [...priorityItems, ...otherItems]) {
      const result = extractNumber(item);
      if (result) {
        return result;
      }
    }
  }
  return undefined;
}

function isLikelyYear(value: string): boolean {
  return /^(19|20)\d{2}$/.test(value);
}

function isNoCodeResponse(value: string): boolean {
  const normalized = value.replace(/\s+/g, "").toLowerCase();
  return /^no\|/.test(normalized) || /暂无验证码|没有验证码|未收到验证码|未获取到验证码|验证码为空|nocode|no验证码/.test(normalized);
}

function extractCodeFromSegments(value: string): string | undefined {
  const segments = value.split("|").map((item) => item.trim()).filter(Boolean);
  const prioritySegment = segments.find((item) => /验证码|校验码|动态码|code|sms|otp/i.test(item));

  if (!prioritySegment) {
    return undefined;
  }

  const codeMatch = prioritySegment.match(/(?:验证码|校验码|动态码|code|sms|otp)\D*(\d{4,8})/i);
  if (codeMatch?.[1]) {
    return codeMatch[1];
  }

  const compactCodeMatch = prioritySegment.replace(/\s+/g, "").match(/(?:验证|码|code|sms|otp).*?(\d{4,8})/i);
  if (compactCodeMatch?.[1]) {
    return compactCodeMatch[1];
  }

  const likelyCodeMatches = prioritySegment.match(/(?<!\d)\d{4,8}(?!\d)/g) ?? [];
  return likelyCodeMatches.find((item) => !isLikelyYear(item));
}

function parseHeaders(text: string): HeadersInit {
  if (!text.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    return text.split(/\r?\n/).reduce<Record<string, string>>((headers, line) => {
      const index = line.indexOf(":");
      if (index > -1) {
        headers[line.slice(0, index).trim()] = line.slice(index + 1).trim();
      }
      return headers;
    }, {});
  }

  return {};
}
