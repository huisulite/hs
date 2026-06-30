import { useState, useCallback, useEffect } from "react";
import { Upload, Trash2 } from "lucide-react";
import { parsePhoneRows } from "@/utils/phone";

interface ImportPanelProps {
  onImport: (text: string, defaultCountryCode: string) => void | Promise<void>;
  onClear: () => void | Promise<void>;
  recordCount: number;
  hideClear?: boolean;
  importButtonText?: string;
}

const importTextStorageKey = "phone-code-tool-import-text";
const countryCodeStorageKey = "phone-code-tool-country-code";

function loadStoredValue(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function ImportPanel({ onImport, onClear, recordCount, hideClear = false, importButtonText = "导入" }: ImportPanelProps) {
  const [text, setText] = useState(() => loadStoredValue(importTextStorageKey, ""));
  const [defaultCountryCode, setDefaultCountryCode] = useState(() => loadStoredValue(countryCodeStorageKey, "86"));
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    localStorage.setItem(importTextStorageKey, text);
  }, [text]);

  useEffect(() => {
    localStorage.setItem(countryCodeStorageKey, defaultCountryCode);
  }, [defaultCountryCode]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    setText((prev) => (prev ? prev + "\n" : "") + pasted);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setText((prev) => (prev ? prev + "\n" : "") + content);
    };
    reader.readAsText(file);
  }, []);

  const handleImport = useCallback(async () => {
    if (!text.trim()) {
      setErrors(["请输入手机号数据"]);
      return;
    }

    const records = parsePhoneRows(text, defaultCountryCode);
    const invalidCount = records.filter((r) => r.status === "failed").length;

    if (records.length === 0) {
      setErrors(["未能解析到有效手机号"]);
      return;
    }

    setErrors([]);
    await onImport(text, defaultCountryCode);
    setText("");

    if (invalidCount > 0) {
      setErrors([`成功导入 ${records.length - invalidCount} 条，${invalidCount} 条格式无效已标记`]);
    }
  }, [text, defaultCountryCode, onImport]);

  return (
    <div className="bg-slate-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">导入手机号</h2>
        {recordCount > 0 && !hideClear && (
          <button
            onClick={() => void onClear()}
            className="flex items-center gap-1 text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            <Trash2 size={14} />
            清空 ({recordCount})
          </button>
        )}
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-1">默认区号</label>
        <input
          type="text"
          value={defaultCountryCode}
          onChange={(e) => setDefaultCountryCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="86"
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
        />
      </div>

      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={handlePaste}
          placeholder="粘贴手机号列表，每行一个手机号，支持格式：
86 13800138000
+8613800138000
13800138000
13800138000----https://api.example.com/code?phone={{phone}}
或上传 CSV 文件"
          className="w-full h-32 bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-cyan-500"
        />
      </div>

      <div className="flex gap-3">
        <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg cursor-pointer transition-colors">
          <Upload size={16} />
          <span>上传文件</span>
          <input type="file" accept=".csv,.txt" onChange={handleFileChange} className="hidden" />
        </label>
        <button
          onClick={() => void handleImport()}
          disabled={!text.trim()}
          className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 disabled:text-slate-400 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {importButtonText}
        </button>
      </div>

      {errors.length > 0 && (
        <div className="text-sm text-amber-400 space-y-1">
          {errors.map((error, i) => (
            <p key={i}>{error}</p>
          ))}
        </div>
      )}
    </div>
  );
}
