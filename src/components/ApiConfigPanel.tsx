import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import type { ApiConfig } from "@/types";

interface ApiConfigPanelProps {
  config: ApiConfig;
  onChange: (config: ApiConfig) => void;
}

export function ApiConfigPanel({ config, onChange }: ApiConfigPanelProps) {
  const [draftConfig, setDraftConfig] = useState(config);

  useEffect(() => {
    setDraftConfig(config);
  }, [config]);

  const updateDraft = (partial: Partial<ApiConfig>) => {
    setDraftConfig((current) => ({ ...current, ...partial }));
  };

  const saveConfig = () => {
    onChange(draftConfig);
  };

  return (
    <div className="bg-slate-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Settings size={18} className="text-cyan-400" />
        <h2 className="text-lg font-semibold text-slate-100">轮询设置</h2>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="block text-sm text-slate-400 mb-1">轮询间隔 (ms)</label>
          <input
            type="number"
            value={draftConfig.intervalMs}
            onChange={(e) => updateDraft({ intervalMs: Math.max(500, parseInt(e.target.value) || 3000) })}
            min={500}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">同时轮询数量</label>
          <input
            type="number"
            value={draftConfig.concurrency}
            onChange={(e) => updateDraft({ concurrency: Math.max(1, Math.min(50, parseInt(e.target.value) || 1)) })}
            min={1}
            max={50}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">成功手机号释放时间 (分钟)</label>
          <input
            type="number"
            value={draftConfig.releaseMinutes ?? 10}
            onChange={(e) => updateDraft({ releaseMinutes: Math.max(1, parseInt(e.target.value) || 10) })}
            min={1}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ToggleSwitch
            label="前台显示库存"
            checked={draftConfig.showStock ?? true}
            onChange={(checked) => updateDraft({ showStock: checked })}
          />
          <ToggleSwitch
            label="前台显示占用"
            checked={draftConfig.showOccupied ?? true}
            onChange={(checked) => updateDraft({ showOccupied: checked })}
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">后台公告</label>
          <textarea
            value={draftConfig.announcement ?? ""}
            onChange={(e) => updateDraft({ announcement: e.target.value })}
            placeholder="输入管理员后台公告内容"
            className="h-28 w-full resize-none rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
          />
        </div>
      </div>
      <button
        onClick={saveConfig}
        className="w-full rounded-lg bg-cyan-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-500"
      >
        保存设置
      </button>
    </div>
  );
}

function ToggleSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-slate-600"
    >
      <span>{label}</span>
      <span className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-cyan-500" : "bg-slate-700"}`}>
        <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </span>
    </button>
  );
}
