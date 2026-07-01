import { useState } from "react";

interface RedeemPageProps {
  onSubmit: (code: string) => Promise<void>;
  loading: boolean;
  error?: string;
  stock: number;
  occupied: number;
  available: number;
  showStock: boolean;
  showOccupied: boolean;
  showAvailable: boolean;
  announcement?: string;
}

export function RedeemPage({ onSubmit, loading, error, stock, occupied, available, showStock, showOccupied, showAvailable, announcement = "" }: RedeemPageProps) {
  const [code, setCode] = useState("");
  const visibleMetricCount = [showStock, showOccupied, showAvailable].filter(Boolean).length;

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <div className="w-full space-y-4">
          {announcement.trim() && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-200">
              <div className="text-sm font-medium text-slate-100">公告</div>
              <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-400">{announcement}</div>
            </div>
          )}
          <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
          <div className="space-y-5 p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-slate-950 p-2 ring-1 ring-slate-800">
                <img src="/logo.png" alt="" className="h-7 w-7 rounded-md object-cover" />
              </div>
              <h2 className="text-xl font-semibold tracking-normal text-slate-100">兑换码</h2>
            </div>

            {visibleMetricCount > 0 && (
              <div className={`grid gap-3 ${visibleMetricCount >= 3 ? "grid-cols-3" : visibleMetricCount === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                {showStock && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
                    <div className="text-sm text-slate-400">库存</div>
                    <div className="mt-1 text-xl font-semibold text-slate-100">{stock}</div>
                  </div>
                )}
                {showOccupied && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
                    <div className="text-sm text-slate-400">占用</div>
                    <div className="mt-1 text-xl font-semibold text-slate-100">{occupied}</div>
                  </div>
                )}
                {showAvailable && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
                    <div className="text-sm text-slate-400">可用</div>
                    <div className="mt-1 text-xl font-semibold text-slate-100">{available}</div>
                  </div>
                )}
              </div>
            )}

            <input
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              placeholder="请输入兑换码"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-4 text-base text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15"
            />

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              onClick={() => onSubmit(code)}
              disabled={!code || loading}
              className="w-full rounded-xl bg-slate-100 py-3.5 text-base font-medium text-slate-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              {loading ? "兑换中..." : "兑换"}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
