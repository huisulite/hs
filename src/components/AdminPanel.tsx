import { useMemo, useState, type ReactNode } from "react";
import { Activity, Copy, Database, Download, LogOut, MessageSquareWarning, Settings, Shield, Ticket, Tickets, Trash2, UploadCloud, type LucideIcon } from "lucide-react";
import { ImportPanel } from "@/components/ImportPanel";
import { ApiConfigPanel } from "@/components/ApiConfigPanel";
import type { ApiConfig, IssueReport, PhoneRecord, PollingTask, RecordStatus, RedeemCode } from "@/types";

interface AdminPanelProps {
  authenticated: boolean;
  onLogin: (username: string, password: string) => boolean;
  onLogout: () => void;
  records: PhoneRecord[];
  redeemCodes: RedeemCode[];
  config: ApiConfig;
  activeIds?: string[];
  serverTasks?: PollingTask[];
  issueReports?: IssueReport[];
  onlineCount?: number;
  onImport: (text: string, defaultCountryCode: string) => Promise<void>;
  onConfigChange: (config: ApiConfig) => Promise<void>;
  onCreateCodes: (codesText: string, quantityPerCode: number) => Promise<void>;
  onGenerateRandomCodes: (count: number, length: number, quantityPerCode: number) => Promise<void>;
  onDeleteCode: (code: string) => Promise<void>;
  onDeleteRecords: (ids: string[]) => Promise<void>;
  onReleaseRecordsCode: (ids: string[]) => Promise<void>;
  onUpdateRecordsCode: (ids: string[], code: string) => Promise<void>;
  onUpdateRecordsStatus: (ids: string[], status: RecordStatus) => Promise<void>;
  onReuseRecords: (ids: string[], unbindDeleted?: boolean) => Promise<void>;
  onExportAccounts: () => void;
  onDeleteIssue: (id: string) => Promise<void>;
  onClearIssues: () => Promise<void>;
}

type AdminSection = "accounts" | "usedAccounts" | "codes" | "tasks" | "settings";

const statusText: Record<string, string> = {
  pending: "等待",
  polling: "轮询中",
  completed: "已完成",
  failed: "失败",
  abnormal: "异常",
  unused: "未使用",
  active: "使用中",
};

export function AdminPanel({ authenticated, onLogin, onLogout, records, redeemCodes, config, serverTasks = [], issueReports = [], onlineCount = 0, onImport, onConfigChange, onCreateCodes, onGenerateRandomCodes, onDeleteCode, onDeleteRecords, onReleaseRecordsCode, onUpdateRecordsCode, onUpdateRecordsStatus, onReuseRecords, onExportAccounts, onDeleteIssue, onClearIssues }: AdminPanelProps) {
  const [codesText, setCodesText] = useState("");
  const [quantityPerCode, setQuantityPerCode] = useState(1);
  const [randomCount, setRandomCount] = useState(10);
  const [randomLength, setRandomLength] = useState(8);
  const [section, setSection] = useState<AdminSection>("accounts");
  const [taskSourceFilter, setTaskSourceFilter] = useState<"all" | "frontend" | "backend">("all");

  const availableCount = useMemo(() => records.filter((item) => !item.assignedCode && item.status !== "completed" && item.status !== "abnormal" && !item.consumedAt).length, [records]);
  const completedCodeCount = useMemo(() => redeemCodes.filter((item) => item.status === "completed").length, [redeemCodes]);
  const activeCodeCount = useMemo(() => redeemCodes.filter((item) => item.status === "active").length, [redeemCodes]);
  const unusedCodeCount = useMemo(() => redeemCodes.filter((item) => item.status === "unused").length, [redeemCodes]);
  const completedRecordCount = useMemo(() => records.filter((item) => item.status === "completed" || item.consumedAt).length, [records]);

  const taskList = useMemo(() => serverTasks.map((item) => ({
    ...item,
    id: item.taskId,
    redeemCode: item.redeemCode || "未绑定兑换码",
  })), [serverTasks]);

  const filteredTaskList = useMemo(() => {
    if (taskSourceFilter === "frontend") {
      return taskList.filter((item) => item.source === "frontend");
    }
    if (taskSourceFilter === "backend") {
      return taskList.filter((item) => item.source === "backend");
    }
    return taskList;
  }, [taskList, taskSourceFilter]);

  const codeList = useMemo(() => redeemCodes.map((item) => {
    const assignedRecordIds = item.assignedRecordIds.filter((recordId) => records.some((record) => record.id === recordId && record.status !== "abnormal"));
    return {
      ...item,
      assignedRecordIds,
      quantity: assignedRecordIds.length,
      completedQuantity: item.completedRecordIds?.length ?? item.assignedRecordIds.filter((recordId) => records.some((record) => record.id === recordId && record.status === "completed")).length,
      abnormalQuantity: item.assignedRecordIds.filter((recordId) => records.some((record) => record.id === recordId && record.status === "abnormal")).length,
    };
  }), [records, redeemCodes]);

  const usableRecords = useMemo(() => records.filter((item) => item.status !== "completed" && !item.consumedAt), [records]);
  const usedRecords = useMemo(() => records.filter((item) => item.status === "completed" || item.consumedAt), [records]);
  const usedRecordCodeMap = useMemo(() => {
    const next = new Map<string, string>();
    redeemCodes.forEach((code) => {
      code.completedRecordIds?.forEach((recordId) => next.set(recordId, code.code));
    });
    return next;
  }, [redeemCodes]);

  const navItems: Array<{ key: AdminSection; label: string; desc: string; icon: LucideIcon; count: number }> = [
    { key: "accounts", label: "账号管理", desc: "导入与查看手机号", icon: Database, count: usableRecords.length },
    { key: "usedAccounts", label: "已使用账号", desc: "已完成账号", icon: Ticket, count: usedRecords.length },
    { key: "codes", label: "兑换码管理", desc: "生成、列表、使用记录", icon: Tickets, count: redeemCodes.length },
    { key: "tasks", label: "任务监控", desc: "查看轮询中任务", icon: Activity, count: taskList.length },
    { key: "settings", label: "系统设置", desc: "轮询与问题列表", icon: Settings, count: issueReports.length },
  ];

  const renderCodeStatus = (status: RedeemCode["status"]) => {
    const className = status === "completed"
      ? "bg-emerald-500/15 text-emerald-300"
      : status === "active"
        ? "bg-cyan-500/15 text-cyan-300"
        : "bg-slate-700 text-slate-300";
    return <span className={`inline-flex rounded-full px-2 py-1 text-xs ${className}`}>{statusText[status]}</span>;
  };

  const renderRecordStatus = (status: PhoneRecord["status"]) => {
    const className = status === "completed"
      ? "text-emerald-300"
      : status === "failed"
        ? "text-red-300"
        : status === "abnormal"
          ? "text-orange-300"
          : status === "polling"
          ? "text-cyan-300"
          : "text-slate-300";
    return <span className={className}>{statusText[status] || status}</span>;
  };

  if (!authenticated) {
    return <AdminLogin onLogin={onLogin} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          onClick={onLogout}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-200"
        >
          <LogOut size={16} />
          退出登录
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="账号列表" value={usableRecords.length} hint={`可分配 ${availableCount}`} />
        <SummaryCard label="兑换码" value={redeemCodes.length} hint={`未使用 ${unusedCodeCount}`} />
        <SummaryCard label="使用中" value={activeCodeCount} hint={`已完成 ${completedCodeCount}`} accent="cyan" />
        <SummaryCard label="任务数" value={taskList.length} hint={`已完成手机号 ${completedRecordCount}`} accent="emerald" />
        <SummaryCard label="在线人数" value={onlineCount} hint="前台访问用户" accent="cyan" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = section === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={`rounded-xl border p-4 text-left transition-colors ${isActive ? "border-slate-500 bg-slate-800" : "border-slate-800 bg-slate-900 hover:border-slate-700"}`}
            >
              <div className="flex min-h-12 items-center justify-center gap-5">
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${isActive ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-900 text-slate-400"}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex h-8 items-center font-medium text-slate-100">{item.label}</div>
                </div>
                <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-900 px-2 text-xs font-semibold text-slate-300">{item.count}</span>
              </div>
            </button>
          );
        })}
      </div>

      {section === "accounts" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <SectionHeader icon={UploadCloud} title="批量导入账号" desc="格式：手机号----api，导入后进入账号列表统一管理。" />
              <ImportPanel
                onImport={async (rows, defaultCountryCode) => onImport(rows, defaultCountryCode)}
                onClear={async () => Promise.resolve()}
                recordCount={usableRecords.length}
                hideClear
                importButtonText="导入"
              />
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <SectionHeader icon={Database} title="账号列表" desc="所有手机号、API、绑定兑换码、状态集中展示。" compact />
                <button
                  onClick={onExportAccounts}
                  disabled={usableRecords.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                >
                  <Download size={16} />
                  导出 CSV
                </button>
              </div>
              <AccountsTable
                records={usableRecords}
                redeemCodes={redeemCodes}
                renderRecordStatus={renderRecordStatus}
                onDeleteRecords={onDeleteRecords}
                onReleaseRecordsCode={onReleaseRecordsCode}
                onUpdateRecordsCode={onUpdateRecordsCode}
                onUpdateRecordsStatus={onUpdateRecordsStatus}
              />
            </div>
          </div>
        </div>
      )}

      {section === "usedAccounts" && (
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <SectionHeader icon={Ticket} title="已使用账号列表" desc="账号完成后自动移入此列表。" />
          <UsedAccountsTable
            records={usedRecords}
            usedRecordCodeMap={usedRecordCodeMap}
            onReuseRecords={onReuseRecords}
            onDeleteRecords={onDeleteRecords}
          />
        </div>
      )}

      {section === "codes" && (
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[420px_minmax(420px,1fr)_minmax(360px,0.9fr)]">
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 space-y-4">
              <SectionHeader icon={Tickets} title="兑换码生成" desc="手动输入兑换码并自动分配手机号。" />
              <div>
                <label className="mb-1 block text-sm text-slate-400">每个兑换码分配手机号数量</label>
                <input
                  type="number"
                  min={1}
                  max={availableCount || 1}
                  value={quantityPerCode}
                  onChange={(event) => setQuantityPerCode(Math.max(1, parseInt(event.target.value) || 1))}
                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">当前可分配手机号：{availableCount}</p>
              </div>
              <textarea
                value={codesText}
                onChange={(event) => setCodesText(event.target.value)}
                placeholder="每行一个兑换码"
                className="h-32 w-full rounded-lg border border-slate-600 bg-slate-900 p-3 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
              <button
                onClick={async () => {
                  await onCreateCodes(codesText, quantityPerCode);
                  setCodesText("");
                }}
                disabled={!codesText.trim() || availableCount < quantityPerCode}
                className="w-full rounded-lg bg-cyan-600 py-2 text-white hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500"
              >
                生成兑换码并自动分配
              </button>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 space-y-4">
              <SectionHeader icon={Ticket} title="随机兑换码" desc="自动生成随机码并分配手机号。" />
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="生成数量" min={1} value={randomCount} onChange={setRandomCount} />
                <NumberField label="码长度" min={4} value={randomLength} onChange={setRandomLength} />
              </div>
              <button
                onClick={() => onGenerateRandomCodes(randomCount, randomLength, quantityPerCode)}
                disabled={availableCount < quantityPerCode * randomCount}
                className="w-full rounded-lg bg-emerald-600 py-2 text-white hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500"
              >
                自动生成随机兑换码
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <SectionHeader icon={Tickets} title="兑换码列表" desc="查看每个兑换码的状态、可兑换数量和完成数量。" />
            <CodesTable codeList={codeList} renderCodeStatus={renderCodeStatus} onDeleteCode={onDeleteCode} />
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <SectionHeader icon={Ticket} title="已使用记录" desc="只展示已使用兑换码统计。" />
            <UsedCodeStats codeList={codeList} />
          </div>
        </div>
      )}

      {section === "tasks" && (
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SectionHeader icon={Activity} title="任务监控" desc="显示前端用户轮询和后台轮询中的任务。" compact />
            <div className="flex flex-wrap gap-2">
              {[
                { key: "all", label: "查看全部" },
                { key: "frontend", label: "只看前端任务" },
                { key: "backend", label: "只看后台任务" },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setTaskSourceFilter(item.key as "all" | "frontend" | "backend")}
                  className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${taskSourceFilter === item.key ? "bg-cyan-600 text-white" : "bg-slate-900 text-slate-300 hover:bg-slate-700"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <TasksTable tasks={filteredTaskList} />
        </div>
      )}

      {section === "settings" && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <SectionHeader icon={Settings} title="轮询设置" desc="统一设置并发、间隔和成功手机号释放时间。" />
            <ApiConfigPanel config={config} onChange={onConfigChange} />
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <SectionHeader icon={MessageSquareWarning} title="问题列表" desc="显示用户前端提交的问题和账号获取状态。" />
              <button
                onClick={onClearIssues}
                disabled={issueReports.length === 0}
                className="rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                清空记录
              </button>
            </div>
            <IssueReportsTable reports={issueReports} onDelete={onDeleteIssue} />
          </div>
        </div>
      )}
    </div>
  );
}

function AdminLogin({ onLogin }: { onLogin: (username: string, password: string) => boolean }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (onLogin(username, password)) {
      return;
    }
    setError("账号或密码错误");
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-md items-center">
      <div className="w-full rounded-3xl border border-slate-700 bg-slate-900/90 p-7 shadow-2xl shadow-cyan-950/20">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-2xl bg-cyan-500/15 p-3 text-cyan-300 ring-1 ring-cyan-400/20">
            <Shield size={22} />
          </div>
          <h2 className="text-2xl font-bold text-slate-100">管理员登录</h2>
        </div>
        <div className="space-y-4">
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value.trim())}
            placeholder="管理员账号"
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none focus:border-cyan-400"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="管理员密码"
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none focus:border-cyan-400"
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
          {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
          <button
            onClick={submit}
            className="w-full rounded-2xl bg-cyan-600 py-3 font-semibold text-white hover:bg-cyan-500"
          >
            登录
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, hint, accent = "slate" }: { label: string; value: number; hint: string; accent?: "slate" | "cyan" | "emerald" }) {
  const color = accent === "cyan" ? "text-cyan-300" : accent === "emerald" ? "text-emerald-300" : "text-slate-100";
  return (
    <div className="min-h-28 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex h-12 items-center justify-center gap-6">
        <p className="text-base font-medium text-slate-400">{label}</p>
        <p className={`min-w-9 text-center text-2xl font-semibold leading-none ${color}`}>{value}</p>
      </div>
      <p className="mt-3 text-center text-sm text-slate-500">{hint}</p>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, desc: _desc, compact = false }: { icon: LucideIcon; title: string; desc: string; compact?: boolean }) {
  return (
    <div className={`flex items-start gap-3 ${compact ? "" : "mb-4"}`}>
      <div className="rounded-lg bg-cyan-500/15 p-2 text-cyan-300">
        <Icon size={18} />
      </div>
      <div>
        <h3 className="font-semibold text-slate-100">{title}</h3>
      </div>
    </div>
  );
}

function NumberField({ label, min, value, onChange }: { label: string; min: number; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-500">{label}</label>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(event) => onChange(Math.max(min, parseInt(event.target.value) || min))}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
      />
    </div>
  );
}

function AccountsTable({ records, redeemCodes, renderRecordStatus, onDeleteRecords, onReleaseRecordsCode, onUpdateRecordsCode, onUpdateRecordsStatus }: {
  records: PhoneRecord[];
  redeemCodes: RedeemCode[];
  renderRecordStatus: (status: PhoneRecord["status"]) => ReactNode;
  onDeleteRecords: (ids: string[]) => Promise<void>;
  onReleaseRecordsCode: (ids: string[]) => Promise<void>;
  onUpdateRecordsCode: (ids: string[], code: string) => Promise<void>;
  onUpdateRecordsStatus: (ids: string[], status: RecordStatus) => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterCode, setFilterCode] = useState("");
  const [targetCode, setTargetCode] = useState("");
  const [targetStatus, setTargetStatus] = useState<RecordStatus>("pending");
  const [operating, setOperating] = useState(false);
  const displayedRecords = useMemo(() => {
    if (filterCode === "__unassigned__") {
      return records.filter((item) => !item.assignedCode);
    }
    return filterCode ? records.filter((item) => item.assignedCode === filterCode) : records;
  }, [filterCode, records]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = displayedRecords.length > 0 && displayedRecords.every((item) => selectedSet.has(item.id));

  const runBatch = async (action: () => Promise<void>) => {
    try {
      setOperating(true);
      await action();
      setSelectedIds([]);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "操作失败");
    } finally {
      setOperating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900/80 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterCode}
            onChange={(event) => {
              const nextCode = event.target.value;
              setFilterCode(nextCode);
              setSelectedIds((prev) => prev.filter((id) => {
                const record = records.find((item) => item.id === id);
                if (!record || !nextCode) return Boolean(record);
                return nextCode === "__unassigned__" ? !record.assignedCode : record.assignedCode === nextCode;
              }));
            }}
            className="min-w-44 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
          >
            <option value="">全部兑换码</option>
            <option value="__unassigned__">未分配兑换码</option>
            {redeemCodes.map((item) => (
              <option key={item.code} value={item.code}>{item.code}</option>
            ))}
          </select>
          <div className="text-sm text-slate-300">已选 {selectedIds.length} 个账号 / 当前 {displayedRecords.length} 个</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={targetCode}
            onChange={(event) => setTargetCode(event.target.value)}
            className="min-w-44 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
          >
            <option value="">选择兑换码</option>
            {redeemCodes.map((item) => (
              <option key={item.code} value={item.code}>{item.code}</option>
            ))}
          </select>
          <button
            onClick={() => void runBatch(() => onUpdateRecordsCode(selectedIds, targetCode))}
            disabled={selectedIds.length === 0 || !targetCode || operating}
            className="rounded-lg bg-cyan-600 px-3 py-2 text-sm text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
          >
            修改兑换码
          </button>
          <select
            value={targetStatus}
            onChange={(event) => setTargetStatus(event.target.value as RecordStatus)}
            className="min-w-32 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
          >
            <option value="pending">等待</option>
            <option value="failed">失败</option>
            <option value="abnormal">异常</option>
            <option value="completed">已完成</option>
            <option value="paused">暂停</option>
          </select>
          <button
            onClick={() => void runBatch(() => onUpdateRecordsStatus(selectedIds, targetStatus))}
            disabled={selectedIds.length === 0 || operating}
            className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
          >
            修改状态
          </button>
          <button
            onClick={() => void runBatch(() => onReleaseRecordsCode(selectedIds))}
            disabled={selectedIds.length === 0 || operating}
            className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-300 hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            释放兑换码
          </button>
          <button
            onClick={() => {
              if (window.confirm(`确定删除选中的 ${selectedIds.length} 个账号吗？`)) {
                void runBatch(() => onDeleteRecords(selectedIds));
              }
            }}
            disabled={selectedIds.length === 0 || operating}
            className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300 hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            删除
          </button>
        </div>
      </div>

      <div className="max-h-[720px] overflow-y-auto rounded-xl border border-slate-700/80 bg-slate-900/90 shadow-sm">
        <table className="w-full table-fixed text-sm">
          <thead className="sticky top-0 bg-slate-950/95">
            <tr className="border-b border-slate-800 text-xs uppercase tracking-wide">
              <th className="w-12 px-3 py-3 text-center text-slate-400">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => {
                    const displayedIds = displayedRecords.map((item) => item.id);
                    setSelectedIds((prev) => event.target.checked
                      ? Array.from(new Set([...prev, ...displayedIds]))
                      : prev.filter((id) => !displayedIds.includes(id)));
                  }}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-cyan-500"
                />
              </th>
              <th className="w-52 px-3 py-3 text-left text-slate-400">手机号</th>
              <th className="px-3 py-3 text-left text-slate-400">API</th>
              <th className="w-44 px-3 py-3 text-center text-slate-400">绑定兑换码</th>
              <th className="w-32 px-3 py-3 text-center text-slate-400">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {displayedRecords.map((record) => (
              <tr key={record.id} className="transition-colors hover:bg-slate-800/70">
                <td className="px-3 py-3 text-center align-middle">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(record.id)}
                    onChange={(event) => setSelectedIds((prev) => event.target.checked ? [...prev, record.id] : prev.filter((id) => id !== record.id))}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-cyan-500"
                  />
                </td>
                <td className="px-3 py-3 align-middle">
                  <div className="inline-flex rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 font-mono text-sm text-slate-100">
                    +{record.countryCode} {record.phone}
                  </div>
                </td>
                <td className="px-3 py-3 align-middle">
                  <div className="max-w-full truncate rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 font-mono text-xs text-slate-400" title={record.api}>{record.api}</div>
                </td>
                <td className="px-3 py-3 text-center align-middle">
                  <span className={`inline-flex max-w-full rounded-full border px-3 py-1 font-mono text-xs ${record.assignedCode ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-200" : "border-slate-700 bg-slate-950/70 text-slate-500"}`}>
                    <span className="truncate">{record.assignedCode ?? "未分配"}</span>
                  </span>
                </td>
                <td className="px-3 py-3 align-middle">
                  <select
                    value={record.status}
                    onChange={(event) => void runBatch(() => onUpdateRecordsStatus([record.id], event.target.value as RecordStatus))}
                    disabled={operating}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-center text-xs text-slate-100 focus:border-cyan-500 focus:outline-none disabled:opacity-60"
                  >
                    <option value="pending">等待</option>
                    <option value="failed">失败</option>
                    <option value="abnormal">异常</option>
                    <option value="completed">已完成</option>
                    <option value="paused">暂停</option>
                  </select>
                </td>
              </tr>
            ))}
            {displayedRecords.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-slate-500">{filterCode ? "当前兑换码暂无绑定账号" : "暂无账号，请先导入手机号"}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsedCodeStats({ codeList }: { codeList: Array<RedeemCode & { quantity: number; completedQuantity: number }> }) {
  const usedCodes = codeList.filter((item) => item.completedQuantity > 0);

  return (
    <div className="max-h-[620px] space-y-2 overflow-y-auto">
      {usedCodes.map((item) => {
        const remaining = Math.max(0, item.quantity - item.completedQuantity);
        return (
          <div key={item.code} className="rounded-lg border border-slate-700 bg-slate-900 p-3">
            <div className="break-all font-mono text-slate-100">兑换码 {item.code}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-emerald-300">已使用 {item.completedQuantity} 个</div>
              <div className="rounded-lg bg-slate-950 px-3 py-2 text-slate-300">剩余 {remaining} 个未使用</div>
            </div>
          </div>
        );
      })}
      {usedCodes.length === 0 && <EmptyText text="暂无已使用兑换码" />}
    </div>
  );
}

function UsedAccountsTable({ records, usedRecordCodeMap, onReuseRecords, onDeleteRecords }: {
  records: PhoneRecord[];
  usedRecordCodeMap: Map<string, string>;
  onReuseRecords: (ids: string[], unbindDeleted?: boolean) => Promise<void>;
  onDeleteRecords: (ids: string[]) => Promise<void>;
}) {
  const [operatingId, setOperatingId] = useState("");

  const runAction = async (id: string, action: () => Promise<void>) => {
    try {
      setOperatingId(id);
      await action();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "操作失败");
    } finally {
      setOperatingId("");
    }
  };

  const handleReuse = async (record: PhoneRecord) => {
    try {
      setOperatingId(record.id);
      await onReuseRecords([record.id]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败";
      if (message.includes("当前兑换码已删除") && window.confirm(`${message}，是否复用？点击是后账号将不绑定兑换码并回到账号列表。`)) {
        await onReuseRecords([record.id], true);
        return;
      }
      window.alert(message);
    } finally {
      setOperatingId("");
    }
  };

  return (
    <div className="max-h-[520px] overflow-y-auto rounded-lg border border-slate-700 bg-slate-900">
      <table className="w-full table-fixed text-sm">
        <thead className="sticky top-0 bg-slate-950">
          <tr>
            <th className="w-44 px-3 py-2 text-left text-slate-400">账号</th>
            <th className="px-3 py-2 text-left text-slate-400">使用兑换码</th>
            <th className="w-44 px-3 py-2 text-left text-slate-400">时间</th>
            <th className="w-36 px-3 py-2 text-left text-slate-400">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {records.map((record) => (
            <tr key={record.id} className="hover:bg-slate-800/80">
              <td className="px-3 py-2 font-mono text-slate-200">+{record.countryCode} {record.phone}</td>
              <td className="break-all px-3 py-2 font-mono text-slate-300">{usedRecordCodeMap.get(record.id) ?? record.assignedCode ?? "已释放"}</td>
              <td className="px-3 py-2 text-slate-400">{record.completedAt || record.consumedAt || "-"}</td>
              <td className="px-3 py-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleReuse(record)}
                    disabled={operatingId === record.id}
                    className="rounded-lg bg-cyan-500/15 px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50"
                  >
                    复用
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`确定删除账号 ${record.phone} 吗？`)) {
                        void runAction(record.id, () => onDeleteRecords([record.id]));
                      }
                    }}
                    disabled={operatingId === record.id}
                    className="rounded-lg bg-red-500/15 px-2 py-1 text-xs text-red-300 hover:bg-red-500/25 disabled:opacity-50"
                  >
                    删除
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {records.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-10 text-center text-slate-500">暂无已使用账号</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CodesTable({ codeList, renderCodeStatus, onDeleteCode }: { codeList: Array<RedeemCode & { quantity: number; completedQuantity: number; abnormalQuantity: number }>; renderCodeStatus: (status: RedeemCode["status"]) => ReactNode; onDeleteCode: (code: string) => Promise<void> }) {
  const [deletingCode, setDeletingCode] = useState("");

  const handleDelete = async (code: string) => {
    if (!window.confirm(`确定删除兑换码 ${code} 吗？删除后会释放已绑定手机号。`)) {
      return;
    }

    try {
      setDeletingCode(code);
      await onDeleteCode(code);
    } finally {
      setDeletingCode("");
    }
  };

  return (
    <div className="max-h-[720px] overflow-y-auto rounded-lg border border-slate-700 bg-slate-900">
      <table className="w-full table-fixed text-sm">
        <thead className="sticky top-0 bg-slate-950">
          <tr>
            <th className="px-4 py-3 text-left text-slate-400">兑换码</th>
            <th className="w-24 px-3 py-3 text-center text-slate-400">状态</th>
            <th className="w-24 px-3 py-3 text-center text-slate-400">可兑换</th>
            <th className="w-24 px-3 py-3 text-center text-slate-400">异常</th>
            <th className="w-24 px-3 py-3 text-center text-slate-400">已完成</th>
            <th className="w-24 px-3 py-3 text-center text-slate-400">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {codeList.map((item) => (
            <tr key={item.code} className="hover:bg-slate-800/80">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="break-all rounded-lg bg-slate-950/70 px-3 py-1.5 font-mono text-slate-100 ring-1 ring-slate-700/70">{item.code}</span>
                  <button
                    onClick={() => void navigator.clipboard.writeText(item.code)}
                    className="shrink-0 rounded-lg bg-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-600"
                    title="复制兑换码"
                  >
                    <Copy size={13} />
                  </button>
                </div>
              </td>
              <td className="px-3 py-3 text-center">{renderCodeStatus(item.status)}</td>
              <td className="px-3 py-3 text-center"><span className="inline-flex min-w-10 justify-center rounded-lg bg-cyan-500/10 px-2 py-1 font-semibold text-cyan-300">{item.quantity}</span></td>
              <td className="px-3 py-3 text-center"><span className="inline-flex min-w-10 justify-center rounded-lg bg-orange-500/10 px-2 py-1 font-semibold text-orange-300">{item.abnormalQuantity}</span></td>
              <td className="px-3 py-3 text-center"><span className="inline-flex min-w-10 justify-center rounded-lg bg-emerald-500/10 px-2 py-1 font-semibold text-emerald-300">{item.completedQuantity}</span></td>
              <td className="px-3 py-3 text-center">
                <button
                  onClick={() => void handleDelete(item.code)}
                  disabled={deletingCode === item.code}
                  className="inline-flex items-center gap-1 rounded-lg bg-red-500/15 px-2 py-1 text-xs text-red-300 hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 size={13} />
                  {deletingCode === item.code ? "删除中" : "删除"}
                </button>
              </td>
            </tr>
          ))}
          {codeList.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-10 text-center text-slate-500">暂无兑换码</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TasksTable({ tasks }: { tasks: Array<PollingTask & { id: string; redeemCode: string }> }) {
  return (
    <div className="max-h-[760px] overflow-y-auto rounded-lg border border-slate-700 bg-slate-900">
      <table className="w-full table-fixed text-sm">
        <thead className="sticky top-0 bg-slate-950">
          <tr>
            <th className="w-44 px-3 py-2 text-left text-slate-400">手机号</th>
            <th className="px-3 py-2 text-left text-slate-400">兑换码</th>
            <th className="w-36 px-3 py-2 text-left text-slate-400">来源</th>
            <th className="w-20 px-3 py-2 text-left text-slate-400">状态</th>
            <th className="w-16 px-3 py-2 text-left text-slate-400">次数</th>
            <th className="w-40 px-3 py-2 text-left text-slate-400">最后请求</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {tasks.map((item) => (
            <tr key={item.id} className="hover:bg-slate-800/80">
              <td className="px-3 py-2 font-mono text-slate-200">+{item.countryCode} {item.phone}</td>
              <td className="break-all px-3 py-2 font-mono text-slate-300">{item.redeemCode}</td>
              <td className="px-3 py-2">
                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${item.source === "frontend" ? "bg-cyan-500/15 text-cyan-300" : "bg-violet-500/15 text-violet-300"}`}>
                  {item.source === "frontend" ? "前端用户轮询" : "后台轮询"}
                </span>
              </td>
              <td className="px-3 py-2 text-cyan-300">轮询中</td>
              <td className="px-3 py-2 text-slate-300">{item.attempts}</td>
              <td className="px-3 py-2 text-slate-400">{item.lastRequestedAt || "-"}</td>
            </tr>
          ))}
          {tasks.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-10 text-center text-slate-500">当前筛选条件下没有正在轮询的任务</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function IssueReportsTable({ reports, onDelete }: { reports: IssueReport[]; onDelete: (id: string) => Promise<void> }) {
  return (
    <div className="max-h-[760px] overflow-y-auto rounded-lg border border-slate-700 bg-slate-900">
      <table className="w-full table-fixed text-sm">
        <thead className="sticky top-0 bg-slate-950">
          <tr>
            <th className="w-40 px-3 py-2 text-left text-slate-400">账号</th>
            <th className="w-32 px-3 py-2 text-left text-slate-400">兑换码</th>
            <th className="w-32 px-3 py-2 text-left text-slate-400">问题</th>
            <th className="w-28 px-3 py-2 text-left text-slate-400">是否获取密钥</th>
            <th className="w-24 px-3 py-2 text-left text-slate-400">密钥</th>
            <th className="w-24 px-3 py-2 text-left text-slate-400">次数</th>
            <th className="px-3 py-2 text-left text-slate-400">说明</th>
            <th className="w-40 px-3 py-2 text-left text-slate-400">提交时间</th>
            <th className="w-24 px-3 py-2 text-center text-slate-400">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {reports.map((item) => (
            <tr key={item.id} className="hover:bg-slate-800/80">
              <td className="px-3 py-2 font-mono text-slate-200">+{item.countryCode} {item.phone}</td>
              <td className="break-all px-3 py-2 font-mono text-cyan-300">{item.redeemCode || "-"}</td>
              <td className="px-3 py-2 text-slate-200">{item.issueType}</td>
              <td className="px-3 py-2">
                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${item.hasResult ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                  {item.hasResult ? "已获取" : "未获取"}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-emerald-300">{item.result || "-"}</td>
              <td className="px-3 py-2 text-slate-300">{item.attempts}</td>
              <td className="break-all px-3 py-2 text-slate-400">{item.detail || "-"}</td>
              <td className="px-3 py-2 text-slate-400">{item.createdAt}</td>
              <td className="px-3 py-2 text-center">
                <button
                  onClick={() => void onDelete(item.id)}
                  className="rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-300 transition-colors hover:bg-red-500/10"
                >
                  清除
                </button>
              </td>
            </tr>
          ))}
          {reports.length === 0 && (
            <tr>
              <td colSpan={9} className="px-3 py-10 text-center text-slate-500">暂无用户提交的问题</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <div className="py-6 text-center text-sm text-slate-500">{text}</div>;
}
