import { Play, Pause, Square, RotateCcw, Download } from "lucide-react";

interface ControlBarProps {
  status: "idle" | "running" | "paused";
  recordCount: number;
  pendingCount: number;
  pollingCount: number;
  completedCount: number;
  failedCount: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRetryAllFailed: () => void;
  onExport: () => void;
  showExport?: boolean;
}

export function ControlBar({
  status,
  recordCount,
  pendingCount,
  pollingCount,
  completedCount,
  failedCount,
  onStart,
  onPause,
  onResume,
  onStop,
  onRetryAllFailed,
  onExport,
  showExport = true,
}: ControlBarProps) {
  const stats = [
    { label: "总数", value: recordCount, className: "text-slate-100" },
    { label: "等待", value: pendingCount, className: "text-amber-300" },
    { label: "轮询", value: pollingCount, className: "text-sky-300" },
    { label: "完成", value: completedCount, className: "text-emerald-300" },
    { label: "失败", value: failedCount, className: "text-red-300" },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid w-full grid-cols-5 gap-2 lg:max-w-3xl lg:gap-3">
          {stats.map((item) => (
            <div key={item.label} className="flex h-14 items-center justify-center gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 sm:px-4">
              <span className="text-sm text-slate-500">{item.label}</span>
              <span className={`min-w-8 text-center text-lg font-semibold leading-none ${item.className}`}>{item.value}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {status === "idle" && (
            <>
              <button
                onClick={onStart}
                disabled={recordCount === 0}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
              >
                <Play size={16} />
                开始轮询
              </button>
              {showExport && (
                <button
                  onClick={onExport}
                  disabled={recordCount === 0}
                  className="flex items-center gap-2 rounded-xl bg-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600"
                >
                  <Download size={16} />
                  导出 CSV
                </button>
              )}
            </>
          )}

          {status === "running" && (
            <>
              <button
                onClick={onPause}
                className="flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-500"
              >
                <Pause size={16} />
                暂停
              </button>
              <button
                onClick={onStop}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-500"
              >
                <Square size={16} />
                停止
              </button>
            </>
          )}

          {status === "paused" && (
            <>
              <button
                onClick={onResume}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                <Play size={16} />
                继续
              </button>
              <button
                onClick={onStop}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-500"
              >
                <Square size={16} />
                停止
              </button>
            </>
          )}

          {failedCount > 0 && (
            <button
              onClick={onRetryAllFailed}
              className="flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-cyan-500"
            >
              <RotateCcw size={16} />
              重试失败 ({failedCount})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
