import type { PhoneRecord, PollingTask } from "@/types";
import { syncPollingTasks } from "@/utils/api";

export function reportTaskProgress(
  source: PollingTask["source"],
  records: PhoneRecord[],
  status: PollingTask["status"]
) {
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const tasks: PollingTask[] = records.map((record) => ({
    taskId: `${source}-${record.id}`,
    recordId: record.id,
    countryCode: record.countryCode,
    phone: record.phone,
    redeemCode: record.assignedCode,
    source,
    status,
    attempts: record.attempts,
    lastRequestedAt: record.lastRequestedAt || now,
    result: record.result,
    error: record.error,
    createdAt: now,
  }));

  return syncPollingTasks({ tasks }).catch(() => []);
}
