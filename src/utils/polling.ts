import type { ApiConfig, PhoneRecord, PollResult } from "@/types";
import { buildRequest, extractNumber, getByPath } from "@/utils/template";

export async function pollRecord(config: ApiConfig, record: PhoneRecord): Promise<PollResult> {
  const lastRequestedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const attempts = record.attempts + 1;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const request = buildRequest(config, record);
    const response = await fetch(request.url, { ...request.init, signal: controller.signal });
    const api = record.api || request.url;

    if (!response.ok) {
      return { id: record.id, api, status: "pending", attempts, lastRequestedAt, error: `HTTP ${response.status}` };
    }

    const text = await response.text();
    const payload = parsePayload(text);
    const value = getByPath(payload, config.resultPath);
    const result = extractNumber(text) ?? extractNumber(value) ?? extractNumber(payload);

    if (result) {
      return { id: record.id, api, result, status: "completed", attempts, lastRequestedAt };
    }

    return { id: record.id, api, status: "pending", attempts, lastRequestedAt, error: `暂未识别数字：${text.slice(0, 80)}` };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "请求超时" : error instanceof Error ? error.message : "请求失败";
    return { id: record.id, api: record.api, status: "pending", attempts, lastRequestedAt, error: message };
  } finally {
    window.clearTimeout(timer);
  }
}

function parsePayload(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
