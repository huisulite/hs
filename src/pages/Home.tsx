import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { AdminPanel } from "@/components/AdminPanel";
import { ControlBar } from "@/components/ControlBar";
import { RecordsTable } from "@/components/RecordsTable";
import { ParticleBackground } from "@/components/ParticleBackground";
import { RedeemPage } from "@/components/RedeemPage";
import { usePolling } from "@/hooks/usePolling";
import { clearIssueReports, createRedeemCodes, deleteIssueReport, deleteRecords, deleteRedeemCode, fetchAppState, fetchIssueReports, fetchOnlineCount, fetchPollingTasks, generateRandomRedeemCodes, importRecords, redeemCode, releaseRecordsCode, reportOnline, reuseRecords, submitIssueReport, syncPollingTasks, syncRecords, updateApiConfig, updateRecordsCode, updateRecordsStatus } from "@/utils/api";
import { toCsv } from "@/utils/phone";
import type { ApiConfig, AppView, IssueReport, PhoneRecord, PollingTask, RecordStatus, RedeemCode } from "@/types";

const ADMIN_AUTH_KEY = "admin-authed";
const ADMIN_AUTH_TIME_KEY = "admin-authed-at";
const ADMIN_SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const ONLINE_CLIENT_KEY = "online-client-id";

function getRecordTime(value?: string) {
  if (!value) {
    return 0;
  }
  const time = Date.parse(value.replace(/\//g, "-"));
  return Number.isFinite(time) ? time : 0;
}

function isExpiredForUser(record: PhoneRecord, releaseMinutes: number, now: number) {
  if (record.status !== "completed") {
    return false;
  }
  const completedAt = getRecordTime(record.completedAt);
  return Boolean(completedAt && now - completedAt >= Math.max(1, releaseMinutes) * 60 * 1000);
}

function isAdminSessionValid() {
  if (sessionStorage.getItem(ADMIN_AUTH_KEY) !== "1") {
    return false;
  }
  const loginAt = Number(sessionStorage.getItem(ADMIN_AUTH_TIME_KEY) || 0);
  return Boolean(loginAt && Date.now() - loginAt < ADMIN_SESSION_MAX_AGE_MS);
}

async function syncTaskSnapshot(
  source: PollingTask["source"],
  records: PhoneRecord[],
  activeIds: string[],
  previousActiveIdsRef: MutableRefObject<Set<string>>
) {
  const activeSet = new Set(activeIds);
  const previousSet = previousActiveIdsRef.current;
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const tasks: PollingTask[] = [];

  records.forEach((record) => {
    if (!activeSet.has(record.id) && !previousSet.has(record.id) && record.status !== "completed" && record.status !== "failed") {
      return;
    }

    const isActive = activeSet.has(record.id);
    const status: PollingTask["status"] = record.status === "completed" ? "completed" : record.status === "failed" ? "failed" : isActive ? "polling" : "stopped";

    tasks.push({
      taskId: `${source}-${record.id}`,
      recordId: record.id,
      countryCode: record.countryCode,
      phone: record.phone,
      redeemCode: record.assignedCode,
      source,
      status,
      attempts: record.attempts,
      lastRequestedAt: record.lastRequestedAt,
      result: record.result,
      error: record.error,
      createdAt: now,
    });
  });

  previousActiveIdsRef.current = activeSet;
  if (tasks.length === 0) {
    return fetchPollingTasks();
  }
  return syncPollingTasks({ tasks });
}

export default function Home() {
  const currentPath = window.location.pathname.replace(/\/$/, "") || "/";
  const isAdminMode = currentPath === "/huisu" && new URLSearchParams(window.location.search).get("admin") === "1";
  const shouldRedirectToUser = !isAdminMode && currentPath !== "/user";
  const [view, setView] = useState<AppView>(isAdminMode ? "admin" : "redeem");
  const [adminRecords, setAdminRecords] = useState<PhoneRecord[]>([]);
  const [sessionRecords, setSessionRecords] = useState<PhoneRecord[]>([]);
  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    endpoint: "https://example.com/api/getCode?phone={{fullPhone}}",
    method: "GET",
    intervalMs: 3000,
    timeoutMs: 10000,
    resultPath: "data.code",
    requestTemplate: '{"phone": "{{fullPhone}}"}',
    headersText: "",
    maxAttempts: 20,
    concurrency: 3,
    releaseMinutes: 10,
    announcement: "",
    showStock: true,
    showOccupied: true,
  });
  const [redeemCodes, setRedeemCodes] = useState<RedeemCode[]>([]);
  const [redeemError, setRedeemError] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const adminLastSyncedSignatureRef = useRef("");
  const userLastSyncedSignatureRef = useRef("");
  const [adminPollState, setAdminPollState] = useState<PhoneRecord[]>([]);
  const [userPollState, setUserPollState] = useState<PhoneRecord[]>([]);
  const [serverTasks, setServerTasks] = useState<PollingTask[]>([]);
  const [issueReports, setIssueReports] = useState<IssueReport[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const [adminAuthed, setAdminAuthed] = useState(isAdminSessionValid);
  const previousAdminActiveIdsRef = useRef<Set<string>>(new Set());
  const previousUserActiveIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (shouldRedirectToUser) {
      window.location.replace("/user");
    }
  }, [shouldRedirectToUser]);

  useEffect(() => {
    if (view !== "user") {
      return;
    }
    const timer = window.setInterval(() => setNowTick(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, [view]);

  const adminPolling = usePolling(adminRecords, apiConfig, "backend");
  const userPolling = usePolling(sessionRecords, apiConfig, "frontend");

  const handleAdminLogout = useCallback(() => {
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    sessionStorage.removeItem(ADMIN_AUTH_TIME_KEY);
    setAdminAuthed(false);
  }, []);
  useEffect(() => {
    if (view !== "admin" || !adminAuthed) {
      return;
    }

    const checkSession = () => {
      if (!isAdminSessionValid()) {
        handleAdminLogout();
      }
    };

    const timer = window.setInterval(checkSession, 60 * 1000);
    window.addEventListener("focus", checkSession);
    document.addEventListener("visibilitychange", checkSession);

    checkSession();

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", checkSession);
      document.removeEventListener("visibilitychange", checkSession);
    };
  }, [adminAuthed, handleAdminLogout, view]);

  const activePolling = view === "admin" ? adminPolling : userPolling;
  const {
    status,
    records: pollRecords,
    activeIds,
    startPolling,
    pausePolling,
    resumePolling,
    stopPolling,
    retryRecord,
    retryAllFailed,
  } = activePolling;

  const loadState = useCallback(async () => {
    const data = await fetchAppState();
    setAdminRecords(data.records);
    setApiConfig(data.apiConfig);
    setRedeemCodes(data.redeemCodes);
    setIssueReports(data.issueReports || []);
    setOnlineCount(data.onlineCount || 0);
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    if (view !== "redeem") {
      return;
    }

    const timer = window.setInterval(() => {
      void loadState();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [loadState, view]);

  useEffect(() => {
    if (view !== "redeem" && view !== "user") {
      return;
    }

    let clientId = localStorage.getItem(ONLINE_CLIENT_KEY);
    if (!clientId) {
      clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(ONLINE_CLIENT_KEY, clientId);
    }

    const report = () => {
      void reportOnline(clientId).catch(() => undefined);
    };

    report();
    const timer = window.setInterval(report, 10000);
    return () => window.clearInterval(timer);
  }, [view]);

  useEffect(() => {
    setAdminPollState(adminPolling.records);
  }, [adminPolling.records]);

  useEffect(() => {
    setUserPollState(userPolling.records);
  }, [userPolling.records]);

  const loadServerTasks = useCallback(async () => {
    const tasks = await fetchPollingTasks();
    setServerTasks(tasks);
  }, []);

  const loadIssues = useCallback(async () => {
    const reports = await fetchIssueReports();
    setIssueReports(reports);
  }, []);

  useEffect(() => {
    void loadServerTasks();
    const timer = window.setInterval(() => {
      void loadServerTasks();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [loadServerTasks]);

  useEffect(() => {
    if (view !== "admin" || !adminAuthed) {
      return;
    }

    const loadOnline = () => {
      void fetchOnlineCount().then((data) => setOnlineCount(data.count)).catch(() => undefined);
    };

    loadOnline();
    const timer = window.setInterval(loadOnline, 5000);
    return () => window.clearInterval(timer);
  }, [adminAuthed, view]);

  useEffect(() => {
    void loadIssues();
    const timer = window.setInterval(() => {
      void loadIssues();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [loadIssues]);

  useEffect(() => {
    syncTaskSnapshot("backend", adminPolling.records, adminPolling.activeIds, previousAdminActiveIdsRef).then(setServerTasks).catch(() => undefined);
  }, [adminPolling.activeIds, adminPolling.records]);

  useEffect(() => {
    syncTaskSnapshot("frontend", userPolling.records, userPolling.activeIds, previousUserActiveIdsRef).then(setServerTasks).catch(() => undefined);
  }, [userPolling.activeIds, userPolling.records]);

  useEffect(() => {
    if (adminPolling.records.length === 0) {
      return;
    }

    const signature = JSON.stringify(
      adminPolling.records.map((item) => ({
        id: item.id,
        status: item.status,
        result: item.result,
        attempts: item.attempts,
        lastRequestedAt: item.lastRequestedAt,
        error: item.error,
      }))
    );

    if (signature === adminLastSyncedSignatureRef.current) {
      return;
    }

    adminLastSyncedSignatureRef.current = signature;
    void syncRecords({ records: adminPolling.records }).then((nextRecords) => {
      setAdminRecords((prev) => {
        const prevSignature = JSON.stringify(prev);
        const nextSignature = JSON.stringify(nextRecords);
        return prevSignature === nextSignature ? prev : nextRecords;
      });
    }).catch(() => undefined);
  }, [adminPolling.records]);

  useEffect(() => {
    if (userPolling.records.length === 0) {
      return;
    }

    const signature = JSON.stringify(
      userPolling.records.map((item) => ({
        id: item.id,
        status: item.status,
        result: item.result,
        attempts: item.attempts,
        lastRequestedAt: item.lastRequestedAt,
        error: item.error,
      }))
    );

    if (signature === userLastSyncedSignatureRef.current) {
      return;
    }

    userLastSyncedSignatureRef.current = signature;
    void syncRecords({ records: userPolling.records }).then((nextRecords) => {
      setSessionRecords((prev) => {
        const prevSignature = JSON.stringify(prev);
        const nextSignature = JSON.stringify(nextRecords);
        return prevSignature === nextSignature ? prev : nextRecords;
      });
    }).catch(() => undefined);
  }, [userPolling.records]);

  const exportRecords = useCallback((records: PhoneRecord[], filenamePrefix: string) => {
    const csv = toCsv(records);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const handleExport = useCallback(() => {
    exportRecords(pollRecords, "phone-results");
  }, [exportRecords, pollRecords]);

  const handleAdminExport = useCallback(() => {
    exportRecords(adminRecords.filter((item) => item.status !== "completed"), "admin-accounts");
  }, [adminRecords, exportRecords]);

  const handleAdminLogin = useCallback((username: string, password: string) => {
    const passed = username === "2512729930" && password === "l123456789";
    if (passed) {
      sessionStorage.setItem(ADMIN_AUTH_KEY, "1");
      sessionStorage.setItem(ADMIN_AUTH_TIME_KEY, String(Date.now()));
      setAdminAuthed(true);
    }
    return passed;
  }, []);

  const handleRedeem = useCallback(async (code: string) => {
    try {
      setRedeemLoading(true);
      setRedeemError("");
      const session = await redeemCode(code);
      userLastSyncedSignatureRef.current = "";
      setSessionRecords(session.records);
      setView("user");
    } catch (error) {
      setRedeemError(error instanceof Error ? error.message : "兑换失败");
    } finally {
      setRedeemLoading(false);
    }
  }, []);

  const handleAdminImport = useCallback(async (text: string, defaultCountryCode: string) => {
    await importRecords({ text, defaultCountryCode });
    adminLastSyncedSignatureRef.current = "";
    userLastSyncedSignatureRef.current = "";
    await loadState();
  }, [loadState]);

  const handleCreateCodes = useCallback(async (codesText: string, quantityPerCode: number) => {
    await createRedeemCodes({ codesText, quantityPerCode });
    adminLastSyncedSignatureRef.current = "";
    userLastSyncedSignatureRef.current = "";
    await loadState();
  }, [loadState]);

  const handleGenerateRandomCodes = useCallback(async (count: number, length: number, quantityPerCode: number) => {
    await generateRandomRedeemCodes({ count, length, quantityPerCode });
    adminLastSyncedSignatureRef.current = "";
    userLastSyncedSignatureRef.current = "";
    await loadState();
  }, [loadState]);

  const handleDeleteRedeemCode = useCallback(async (code: string) => {
    const nextCodes = await deleteRedeemCode(code);
    setRedeemCodes(nextCodes);
    adminLastSyncedSignatureRef.current = "";
    userLastSyncedSignatureRef.current = "";
    await loadState();
    await loadServerTasks();
  }, [loadServerTasks, loadState]);

  const handleDeleteRecords = useCallback(async (ids: string[]) => {
    const nextRecords = await deleteRecords(ids);
    setAdminRecords(nextRecords);
    adminLastSyncedSignatureRef.current = "";
    userLastSyncedSignatureRef.current = "";
    await loadState();
    await loadServerTasks();
  }, [loadServerTasks, loadState]);

  const handleReleaseRecordsCode = useCallback(async (ids: string[]) => {
    const nextRecords = await releaseRecordsCode(ids);
    setAdminRecords(nextRecords);
    adminLastSyncedSignatureRef.current = "";
    userLastSyncedSignatureRef.current = "";
    await loadState();
    await loadServerTasks();
  }, [loadServerTasks, loadState]);

  const handleUpdateRecordsCode = useCallback(async (ids: string[], code: string) => {
    const nextRecords = await updateRecordsCode(ids, code);
    setAdminRecords(nextRecords);
    adminLastSyncedSignatureRef.current = "";
    userLastSyncedSignatureRef.current = "";
    await loadState();
    await loadServerTasks();
  }, [loadServerTasks, loadState]);

  const handleUpdateRecordsStatus = useCallback(async (ids: string[], nextStatus: RecordStatus) => {
    const nextRecords = await updateRecordsStatus(ids, nextStatus);
    setAdminRecords(nextRecords);
    adminLastSyncedSignatureRef.current = "";
    userLastSyncedSignatureRef.current = "";
    await loadState();
    await loadServerTasks();
  }, [loadServerTasks, loadState]);

  const handleReuseRecords = useCallback(async (ids: string[], unbindDeleted = false) => {
    const nextRecords = await reuseRecords(ids, unbindDeleted);
    setAdminRecords(nextRecords);
    adminLastSyncedSignatureRef.current = "";
    userLastSyncedSignatureRef.current = "";
    await loadState();
    await loadServerTasks();
  }, [loadServerTasks, loadState]);

  const handleSubmitIssue = useCallback(async (record: PhoneRecord, issueType: string, detail: string) => {
    const reports = await submitIssueReport({ recordId: record.id, issueType, detail });
    setIssueReports(reports);
    userPolling.failRecord(record.id, issueType);
  }, [userPolling]);

  const handleDeleteIssue = useCallback(async (id: string) => {
    try {
      const reports = await deleteIssueReport(id);
      setIssueReports(reports);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "清除失败");
    }
  }, []);

  const handleClearIssues = useCallback(async () => {
    if (!window.confirm("确定清空全部问题记录吗？")) {
      return;
    }
    try {
      const reports = await clearIssueReports();
      setIssueReports(reports);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "清空失败");
    }
  }, []);

  const realtimeStock = useMemo(() => adminRecords.filter((item) => !item.assignedCode && item.status !== "completed" && item.status !== "abnormal").length, [adminRecords]);
  const occupiedStock = useMemo(() => adminRecords.filter((item) => Boolean(item.assignedCode)).length, [adminRecords]);

  const currentRecords = useMemo(() => {
    if (view === "admin") {
      return status === "running" ? pollRecords : adminPollState.length > 0 ? adminPollState : adminRecords;
    }

    const source = status === "running" ? pollRecords : userPollState.length > 0 ? userPollState : sessionRecords;
    return source.filter((record) => !isExpiredForUser(record, apiConfig.releaseMinutes, nowTick));
  }, [adminPollState, adminRecords, apiConfig.releaseMinutes, nowTick, pollRecords, sessionRecords, status, userPollState, view]);

  const stats = useMemo(() => {
    const source = currentRecords;
    const pollingSet = new Set(activeIds);
    const pending = source.filter((r) => r.status === "pending" && !pollingSet.has(r.id)).length;
    const polling = source.filter((r) => pollingSet.has(r.id)).length;
    const completed = source.filter((r) => r.status === "completed").length;
    const failed = source.filter((r) => r.status === "failed").length;
    return { pending, polling, completed, failed };
  }, [activeIds, currentRecords]);

  if (shouldRedirectToUser) {
    return null;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <ParticleBackground />
      <main className={`relative z-10 w-full space-y-5 overflow-x-hidden ${view === "redeem" ? "px-0 py-0" : isAdminMode ? "px-4 py-5" : "px-4 py-4"}`}>
        {view === "redeem" && <RedeemPage onSubmit={handleRedeem} loading={redeemLoading} error={redeemError} stock={realtimeStock} occupied={occupiedStock} showStock={apiConfig.showStock} showOccupied={apiConfig.showOccupied} announcement={apiConfig.announcement} />}

        {view === "user" && (
          <>
            <ControlBar
              status={status}
              recordCount={currentRecords.length}
              pendingCount={stats.pending}
              pollingCount={stats.polling}
              completedCount={stats.completed}
              failedCount={stats.failed}
              onStart={startPolling}
              onPause={pausePolling}
              onResume={resumePolling}
              onStop={stopPolling}
              onRetryAllFailed={retryAllFailed}
              onExport={handleExport}
              showExport={false}
            />

            <RecordsTable
              records={currentRecords}
              activeIds={activeIds}
              onRetry={retryRecord}
              onDelete={() => undefined}
              hideApi
              hideDelete
              hideError
              showIssueSubmit
              onSubmitIssue={handleSubmitIssue}
            />
          </>
        )}

        {view === "admin" && (
          <AdminPanel
            authenticated={adminAuthed}
            onLogin={handleAdminLogin}
            onLogout={handleAdminLogout}
            records={adminRecords}
            redeemCodes={redeemCodes}
            config={apiConfig}
            activeIds={activeIds}
            serverTasks={serverTasks}
            issueReports={issueReports}
            onlineCount={onlineCount}
            onImport={handleAdminImport}
            onConfigChange={async (config) => {
              const next = await updateApiConfig(config);
              setApiConfig(next);
            }}
            onCreateCodes={handleCreateCodes}
            onGenerateRandomCodes={handleGenerateRandomCodes}
            onDeleteCode={handleDeleteRedeemCode}
            onDeleteRecords={handleDeleteRecords}
            onReleaseRecordsCode={handleReleaseRecordsCode}
            onUpdateRecordsCode={handleUpdateRecordsCode}
            onUpdateRecordsStatus={handleUpdateRecordsStatus}
            onReuseRecords={handleReuseRecords}
            onExportAccounts={handleAdminExport}
            onDeleteIssue={handleDeleteIssue}
            onClearIssues={handleClearIssues}
          />
        )}
      </main>
    </div>
  );
}
