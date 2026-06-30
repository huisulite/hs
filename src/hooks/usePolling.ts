import { useState, useCallback, useRef, useEffect } from "react";
import type { ApiConfig, PhoneRecord, PollResult } from "@/types";
import { pollRecord } from "@/utils/polling";
import { reportTaskProgress } from "@/utils/task-reporting";

export function usePolling(records: PhoneRecord[], config: ApiConfig, source: "frontend" | "backend" = "frontend") {
  const [status, setStatus] = useState<"idle" | "running" | "paused">("idle");
  const [updatedRecords, setUpdatedRecords] = useState<PhoneRecord[]>(records);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const timerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const configRef = useRef(config);
  const statusRef = useRef(status);
  const recordsRef = useRef(records);
  const activeIdsRef = useRef<Set<string>>(new Set());
  const displayIdsRef = useRef<Set<string>>(new Set());
  const blockedIdsRef = useRef<Set<string>>(new Set());
  const runIdRef = useRef(0);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    recordsRef.current = records;
    if (statusRef.current !== "running") {
      setUpdatedRecords(records);
    }
  }, [records]);

  const updateRecord = useCallback((result: PollResult) => {
    setUpdatedRecords((prev) => {
      const next = prev.map((r) => (r.id === result.id ? { ...r, ...result } : r));
      recordsRef.current = next;
      return next;
    });
  }, []);

  const syncActiveIds = useCallback(() => {
    setActiveIds(Array.from(displayIdsRef.current));
  }, []);

  const startPolling = useCallback(async () => {
    if (status === "running") return;
    statusRef.current = "running";
    setStatus("running");
    const runId = ++runIdRef.current;

    const pollNext = async () => {
      if (statusRef.current !== "running" || runIdRef.current !== runId) return;

      const currentConfig = configRef.current;
      const concurrency = Math.max(1, currentConfig.concurrency || 1);
      const pollableRecords = recordsRef.current.filter(
        (r) => (r.status === "pending" || r.status === "polling") && !activeIdsRef.current.has(r.id) && !blockedIdsRef.current.has(r.id)
      );
      const groupKey = (record: PhoneRecord) => record.assignedCode || "__unassigned__";
      const activeCounts = new Map<string, number>();
      const displayCounts = new Map<string, number>();

      recordsRef.current.forEach((record) => {
        const key = groupKey(record);
        if (activeIdsRef.current.has(record.id)) {
          activeCounts.set(key, (activeCounts.get(key) || 0) + 1);
        }
        if (displayIdsRef.current.has(record.id) && (record.status === "pending" || record.status === "polling")) {
          displayCounts.set(key, (displayCounts.get(key) || 0) + 1);
        }
      });

      const groups = new Map<string, PhoneRecord[]>();
      pollableRecords.forEach((record) => {
        const key = groupKey(record);
        groups.set(key, [...(groups.get(key) || []), record]);
      });

      const recordsToPoll: PhoneRecord[] = [];
      groups.forEach((items, key) => {
        const activeCount = activeCounts.get(key) || 0;
        const displayCount = displayCounts.get(key) || 0;
        const availableSlots = Math.max(0, concurrency - activeCount);
        if (availableSlots <= 0) {
          return;
        }

        const displayedItems = items.filter((record) => displayIdsRef.current.has(record.id));
        const newItems = items.filter((record) => !displayIdsRef.current.has(record.id));
        const missingDisplaySlots = Math.max(0, concurrency - displayCount);
        const selected = [
          ...displayedItems.slice(0, availableSlots),
          ...newItems.slice(0, Math.min(missingDisplaySlots, Math.max(0, availableSlots - displayedItems.length))),
        ];
        recordsToPoll.push(...selected);
      });

      if (recordsToPoll.length === 0 && activeIdsRef.current.size === 0) {
        statusRef.current = "idle";
        displayIdsRef.current.clear();
        syncActiveIds();
        setStatus("idle");
        return;
      }

      recordsToPoll.forEach((record) => {
        activeIdsRef.current.add(record.id);
        displayIdsRef.current.add(record.id);
      });
      if (recordsToPoll.length > 0) {
        void reportTaskProgress(source, recordsToPoll, "polling");
      }
      syncActiveIds();

      await Promise.all(recordsToPoll.map(async (record) => {
        if (statusRef.current !== "running" || runIdRef.current !== runId) return;

        const result = await pollRecord(currentConfig, record);
        if (statusRef.current !== "running" || runIdRef.current !== runId || blockedIdsRef.current.has(record.id)) {
          activeIdsRef.current.delete(record.id);
          displayIdsRef.current.delete(record.id);
          syncActiveIds();
          return;
        }
        updateRecord(result);
        activeIdsRef.current.delete(record.id);
        if (result.status === "completed" || result.status === "failed") {
          displayIdsRef.current.delete(record.id);
        }
        void reportTaskProgress(source, [{ ...record, ...result }], result.status === "completed" ? "completed" : "polling");
      }));

      if (statusRef.current === "running" && runIdRef.current === runId) {
        const timer = setTimeout(pollNext, currentConfig.intervalMs);
        timerRefs.current.set("poll-loop", timer);
      }
    };

    pollNext();
  }, [source, status, updateRecord]);

  const resetRecordForPolling = useCallback((id: string) => {
    blockedIdsRef.current.delete(id);
    setUpdatedRecords((prev) => {
      const next = prev.map((r) => r.id === id ? {
        ...r,
        result: "",
        status: "pending" as const,
        error: undefined,
      } : r);
      recordsRef.current = next;
      return next;
    });
  }, []);

  const pausePolling = useCallback(() => {
    runIdRef.current += 1;
    statusRef.current = "paused";
    setStatus("paused");
    const stoppedRecords = recordsRef.current.filter((record) => displayIdsRef.current.has(record.id));
    if (stoppedRecords.length > 0) {
      void reportTaskProgress(source, stoppedRecords, "stopped");
    }
    activeIdsRef.current.clear();
    displayIdsRef.current.clear();
    syncActiveIds();
    timerRefs.current.forEach((timer) => clearTimeout(timer));
    timerRefs.current.clear();
  }, [source, syncActiveIds]);

  const resumePolling = useCallback(() => {
    statusRef.current = "idle";
    setStatus("idle");
    startPolling();
  }, [startPolling]);

  const stopPolling = useCallback(() => {
    runIdRef.current += 1;
    statusRef.current = "idle";
    const stoppedRecords = recordsRef.current.filter((record) => displayIdsRef.current.has(record.id));
    if (stoppedRecords.length > 0) {
      void reportTaskProgress(source, stoppedRecords, "stopped");
    }
    activeIdsRef.current.clear();
    displayIdsRef.current.clear();
    syncActiveIds();
    setStatus("idle");
    timerRefs.current.forEach((timer) => clearTimeout(timer));
    timerRefs.current.clear();
    setUpdatedRecords((prev) => {
      const next = prev.map((r) => ({ ...r, status: r.status === "polling" ? "pending" as const : r.status }));
      recordsRef.current = next;
      return next;
    });
  }, [source, syncActiveIds]);

  useEffect(() => {
    if (status === "idle") {
      recordsRef.current = updatedRecords;
    }
  }, [status, updatedRecords]);

  const failRecord = useCallback((id: string, error = "用户提交问题") => {
    blockedIdsRef.current.add(id);
    activeIdsRef.current.delete(id);
    displayIdsRef.current.delete(id);
    syncActiveIds();
    setUpdatedRecords((prev) => {
      const next = prev.map((record) => record.id === id ? {
        ...record,
        status: "abnormal" as const,
        error,
      } : record);
      recordsRef.current = next;
      const failedRecord = next.find((record) => record.id === id);
      if (failedRecord) {
        void reportTaskProgress(source, [failedRecord], "failed");
      }
      return next;
    });
  }, [source, syncActiveIds]);

  const retryRecord = useCallback(
    (id: string) => {
      resetRecordForPolling(id);
      if (statusRef.current !== "running") {
        startPolling();
      }
    },
    [resetRecordForPolling, startPolling]
  );

  const retryAllFailed = useCallback(() => {
    blockedIdsRef.current.clear();
    setUpdatedRecords((prev) => {
      const next = prev.map((r) =>
        r.status === "failed"
          ? { ...r, status: "pending" as const, attempts: 0, error: undefined }
          : r
      );
      recordsRef.current = next;
      return next;
    });

    if (statusRef.current !== "running") {
      startPolling();
    }
  }, [startPolling]);

  return {
    status,
    records: updatedRecords,
    activeIds,
    startPolling,
    pausePolling,
    resumePolling,
    stopPolling,
    retryRecord,
    retryAllFailed,
    failRecord,
  };
}
