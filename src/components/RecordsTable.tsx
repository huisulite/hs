import { useState } from "react";
import { RefreshCw, CheckCircle2, AlertCircle, Clock, Pause, Copy, Check, Trash2, Send } from "lucide-react";
import type { PhoneRecord } from "@/types";

interface RecordsTableProps {
  records: PhoneRecord[];
  activeIds?: string[];
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
  hideApi?: boolean;
  hideDelete?: boolean;
  hideError?: boolean;
  showIssueSubmit?: boolean;
  onSubmitIssue?: (record: PhoneRecord, issueType: string, detail: string) => Promise<void> | void;
}

const statusConfig = {
  pending: { label: "等待", color: "text-amber-400", bg: "bg-amber-400/20", icon: Clock },
  polling: { label: "轮询中", color: "text-blue-400", bg: "bg-blue-400/20", icon: Clock },
  completed: { label: "已完成", color: "text-green-400", bg: "bg-green-400/20", icon: CheckCircle2 },
  failed: { label: "失败", color: "text-red-400", bg: "bg-red-400/20", icon: AlertCircle },
  abnormal: { label: "异常", color: "text-orange-300", bg: "bg-orange-400/20", icon: AlertCircle },
  paused: { label: "已暂停", color: "text-slate-400", bg: "bg-slate-400/20", icon: Pause },
};

export function RecordsTable({ records, activeIds = [], onRetry, onDelete, hideApi = false, hideDelete = false, hideError = false, showIssueSubmit = false, onSubmitIssue }: RecordsTableProps) {
  const [copiedKey, setCopiedKey] = useState("");
  const [issueRecord, setIssueRecord] = useState<PhoneRecord | null>(null);
  const [issueType, setIssueType] = useState("无法获取密钥");
  const [issueDetail, setIssueDetail] = useState("");

  const copyText = async (text: string, key: string) => {
    if (!text) {
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(""), 1200);
  };

  const submitIssue = async () => {
    if (!issueRecord) return;
    try {
      await onSubmitIssue?.(issueRecord, issueType, issueDetail);
      window.alert("问题已提交");
      setIssueRecord(null);
      setIssueType("无法获取密钥");
      setIssueDetail("");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "提交失败");
    }
  };

  if (records.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-700/80 bg-slate-800/80 p-10 text-center shadow-xl shadow-slate-950/20">
        <Clock size={44} className="mx-auto mb-4 text-slate-600" />
        <p className="text-slate-400">暂无数据</p>
      </div>
    );
  }

  return (
    <>
    <div className="overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-800/80 shadow-xl shadow-slate-950/20">
      <div className="max-h-[calc(100vh-260px)] min-h-[420px] overflow-y-auto overflow-x-hidden">
        <table className="w-full table-fixed text-xs">
          <thead className="sticky top-0 z-10 bg-slate-950">
            <tr>
              <th className="w-[10%] px-3 py-4 text-center font-medium text-slate-400">区号</th>
              <th className={`${showIssueSubmit ? "w-[20%]" : "w-[22%]"} px-3 py-4 text-center font-medium text-slate-400`}>账号</th>
              {!hideApi && <th className="w-[30%] px-3 py-4 text-center font-medium text-slate-400">API</th>}
              <th className="w-[18%] px-3 py-4 text-center font-medium text-slate-400">密钥</th>
              <th className="w-[16%] px-3 py-4 text-center font-medium text-slate-400">状态</th>
              <th className="w-[10%] px-3 py-4 text-center font-medium text-slate-400">次数</th>
              <th className={`${showIssueSubmit ? "w-[16%]" : "w-[24%]"} px-3 py-4 text-center font-medium text-slate-400`}>时间</th>
              {showIssueSubmit && <th className="w-[10%] px-3 py-4 text-center font-medium text-slate-400">提交</th>}
              {!hideError && <th className="w-[11%] px-3 py-4 text-center font-medium text-slate-400">错误</th>}
              {!hideDelete && <th className="w-[5%] px-3 py-4 text-center font-medium text-slate-400">操作</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {records.map((record) => {
              const displayStatus = activeIds.includes(record.id) ? "polling" : record.status;
              const config = statusConfig[displayStatus];
              const StatusIcon = config.icon;
              return (
                <tr key={record.id} className="transition-colors hover:bg-slate-700/35">
                  <td className="px-3 py-3 text-center align-middle">
                    <span className="inline-flex min-w-12 justify-center rounded-full bg-slate-900/70 px-3 py-1 font-mono text-slate-200 ring-1 ring-slate-700/70">{record.countryCode}</span>
                  </td>
                  <td className="px-3 py-3 text-center font-mono text-slate-100 align-middle">
                    <button
                      onClick={() => copyText(record.phone, `${record.id}-phone`)}
                      className="inline-flex items-center justify-center gap-1 rounded-xl bg-slate-900/40 px-3 py-1.5 transition-colors hover:bg-slate-900 hover:text-cyan-300"
                      title="点击复制手机号"
                    >
                      {record.phone}
                      {copiedKey === `${record.id}-phone` ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </td>
                  {!hideApi && (
                    <td className="px-3 py-3 text-center font-mono text-slate-400 align-middle" title={record.api}>
                      <button
                        onClick={() => copyText(record.api, `${record.id}-api`)}
                        className="inline-flex max-w-full items-start gap-1 text-left break-all leading-5 hover:text-cyan-300 transition-colors"
                        title="点击复制 API"
                      >
                        <span>{record.api}</span>
                        <span className="mt-1 shrink-0">{copiedKey === `${record.id}-api` ? <Check size={12} /> : <Copy size={12} />}</span>
                      </button>
                    </td>
                  )}
                  <td className="px-3 py-3 text-center font-mono align-middle">
                    {record.result ? (
                      <span className="inline-flex min-w-16 justify-center rounded-xl bg-emerald-400/10 px-3 py-1.5 text-base font-bold text-emerald-300 ring-1 ring-emerald-400/20">{record.result}</span>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center align-middle">
                    <span className={`inline-flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium ${config.bg} ${config.color}`}>
                      <StatusIcon size={12} />
                      {config.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-slate-400 align-middle">{record.attempts}</td>
                  <td className="px-3 py-3 text-center text-slate-400 align-middle break-words">{record.lastRequestedAt || "-"}</td>
                  {showIssueSubmit && (
                    <td className="px-3 py-3 text-center align-middle">
                      <button
                        onClick={() => setIssueRecord(record)}
                        className="inline-flex items-center justify-center gap-1 rounded-lg bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-300 ring-1 ring-cyan-400/25 transition-colors hover:bg-cyan-500/25"
                      >
                        <Send size={12} />
                        提交
                      </button>
                    </td>
                  )}
                  {!hideError && (
                    <td className="px-3 py-3 text-center align-middle">
                      {record.error ? (
                        <span className="text-red-400 block truncate" title={record.error}>
                          {record.error}
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                  )}
                  {!hideDelete && (
                    <td className="px-3 py-3 text-center align-middle">
                      <div className="flex justify-center gap-1">
                        {record.status === "failed" && (
                          <button
                            onClick={() => onRetry(record.id)}
                            className="inline-flex items-center p-1 text-xs bg-slate-600 hover:bg-slate-500 text-slate-200 rounded transition-colors"
                            title="重试"
                          >
                            <RefreshCw size={12} />
                          </button>
                        )}
                        <button
                          onClick={() => onDelete(record.id)}
                          className="inline-flex items-center p-1 text-xs bg-red-600/80 hover:bg-red-500 text-white rounded transition-colors"
                          title="删除该手机号"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    {issueRecord && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl shadow-slate-950/40">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-100">提交问题</h3>
            <p className="mt-1 text-sm text-slate-400">账号：{issueRecord.phone}</p>
          </div>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-slate-300">问题类型</span>
              <select
                value={issueType}
                onChange={(event) => setIssueType(event.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400"
              >
                <option value="无法获取密钥">无法获取密钥</option>
                <option value="密钥无效">密钥无效</option>
                <option value="账号异常">账号异常</option>
                <option value="其他问题">其他问题</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-300">补充说明</span>
              <textarea
                value={issueDetail}
                onChange={(event) => setIssueDetail(event.target.value)}
                placeholder="可自行输入其他问题"
                rows={4}
                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400"
              />
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setIssueRecord(null)}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
            >
              取消
            </button>
            <button
              onClick={submitIssue}
              className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-cyan-400"
            >
              提交
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
