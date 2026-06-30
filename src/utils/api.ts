import type { ApiConfig, AppState, IssueReport, PhoneRecord, PollingTask, RecordStatus, RedeemCode, RedeemSession } from "@/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const text = await response.text();
  let payload: { data?: T; error?: string } | null = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      if (!response.ok) {
        throw new Error(text);
      }
      throw new Error(`接口返回不是 JSON：${text.slice(0, 120)}`);
    }
  }

  if (!response.ok) {
    throw new Error(payload?.error || text || "请求失败");
  }

  return payload?.data as T;
}

export function fetchAppState() {
  return request<AppState>("/api/state");
}

export function updateApiConfig(config: ApiConfig) {
  return request<ApiConfig>("/api/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export function importRecords(payload: { text: string; defaultCountryCode: string }) {
  return request<PhoneRecord[]>("/api/admin/import-records", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteRecord(recordId: string) {
  return request<{ success: boolean }>(`/api/admin/records/${recordId}`, {
    method: "DELETE",
  });
}

export function deleteRecords(ids: string[]) {
  return request<PhoneRecord[]>("/api/admin/records/delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export function releaseRecordsCode(ids: string[]) {
  return request<PhoneRecord[]>("/api/admin/records/release-code", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export function updateRecordsCode(ids: string[], code: string) {
  return request<PhoneRecord[]>("/api/admin/records/update-code", {
    method: "POST",
    body: JSON.stringify({ ids, code }),
  });
}

export function updateRecordsStatus(ids: string[], status: RecordStatus) {
  return request<PhoneRecord[]>("/api/admin/records/update-status", {
    method: "POST",
    body: JSON.stringify({ ids, status }),
  });
}

export function reuseRecords(ids: string[], unbindDeleted = false) {
  return request<PhoneRecord[]>("/api/admin/records/reuse", {
    method: "POST",
    body: JSON.stringify({ ids, unbindDeleted }),
  });
}

export function createRedeemCodes(payload: { codesText: string; quantityPerCode: number }) {
  return request<RedeemCode[]>("/api/admin/redeem-codes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function generateRandomRedeemCodes(payload: { count: number; length: number; quantityPerCode: number }) {
  return request<RedeemCode[]>("/api/admin/redeem-codes/random", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteRedeemCode(code: string) {
  return request<RedeemCode[]>(`/api/admin/redeem-codes/${encodeURIComponent(code)}`, {
    method: "DELETE",
  });
}

export function redeemCode(code: string) {
  return request<RedeemSession>("/api/redeem", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function syncRecords(payload: { records: PhoneRecord[] }) {
  return request<PhoneRecord[]>("/api/records/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchIssueReports() {
  return request<IssueReport[]>("/api/issues");
}

export function submitIssueReport(payload: { recordId: string; issueType: string; detail: string }) {
  return request<IssueReport[]>("/api/issues", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteIssueReport(id: string) {
  return request<IssueReport[]>("/api/issues/delete", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

export function clearIssueReports() {
  return request<IssueReport[]>("/api/issues/clear", {
    method: "POST",
  });
}

export function fetchPollingTasks() {
  return request<PollingTask[]>("/api/tasks");
}

export function syncPollingTasks(payload: { tasks: PollingTask[] }) {
  return request<PollingTask[]>("/api/tasks/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
