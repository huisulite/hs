import express from "express";
import cors from "cors";
import {
  activateRedeemCode,
  assignRecordsToCode,
  createIssueReport,
  createRedeemCodes,
  clearIssueReports,
  deleteIssueReport,
  deleteRecordById,
  deleteRecordsByIds,
  deleteRedeemCode,
  generateRandomCodes,
  getApiConfig,
  listIssueReports,
  listPollingTasks,
  listRecords,
  listRedeemCodes,
  releaseRecordsRedeemCode,
  reuseCompletedRecords,
  saveApiConfig,
  syncPolledRecords,
  updateRecordsRedeemCode,
  updateRecordsStatus,
  upsertPollingTasks,
  upsertRecords,
} from "./db.js";

const app = express();
const port = 5175;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/proxy", async (req, res) => {
  try {
    const target = String(req.query.target || "").trim().replace(/^`|`$/g, "");

    if (!/^https?:\/\//i.test(target)) {
      res.status(400).send("无效的 target 参数");
      return;
    }

    const response = await fetch(target, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "*/*",
      },
    });
    const text = await response.text();

    res.status(response.status);
    res.setHeader("Content-Type", response.headers.get("content-type") || "text/plain; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(text);
  } catch (error) {
    res.status(502).send(error instanceof Error ? error.message : "代理请求失败");
  }
});

app.get("/api/state", (_req, res) => {
  res.json({
    data: {
      records: listRecords(),
      apiConfig: getApiConfig(),
      redeemCodes: listRedeemCodes(),
      issueReports: listIssueReports(),
    },
  });
});

app.put("/api/config", (req, res) => {
  res.json({ data: saveApiConfig(req.body) });
});

app.post("/api/admin/import-records", (req, res) => {
  const { text = "", defaultCountryCode = "86" } = req.body ?? {};
  const records = parsePhoneRows(text, defaultCountryCode).filter((item) => item.api.trim());
  const existingPhones = new Set(listRecords().map((item) => item.phone));
  const unique = records.filter((item) => !existingPhones.has(item.phone));
  const data = upsertRecords(unique);
  res.json({ data });
});

app.delete("/api/admin/records/:id", (req, res) => {
  deleteRecordById(req.params.id);
  res.json({ data: { success: true } });
});

app.post("/api/admin/records/delete", (req, res) => {
  res.json({ data: deleteRecordsByIds(req.body?.ids || []) });
});

app.post("/api/admin/records/release-code", (req, res) => {
  res.json({ data: releaseRecordsRedeemCode(req.body?.ids || []) });
});

app.post("/api/admin/records/reuse", (req, res) => {
  res.json({ data: reuseCompletedRecords(req.body?.ids || [], Boolean(req.body?.unbindDeleted)) });
});

app.post("/api/admin/records/update-code", (req, res) => {
  res.json({ data: updateRecordsRedeemCode(req.body?.ids || [], req.body?.code) });
});

app.post("/api/admin/records/update-status", (req, res) => {
  res.json({ data: updateRecordsStatus(req.body?.ids || [], req.body?.status) });
});

app.post("/api/admin/redeem-codes", (req, res) => {
  const text = String(req.body?.codesText || "");
  const quantity = Math.max(0, Number(req.body?.quantityPerCode) || 0);
  const codes = [...new Set(text.split(/\r?\n|[,，\s]+/).map((item) => item.trim()).filter(Boolean))];
  res.json({ data: createRedeemCodes(codes, quantity) });
});

app.post("/api/admin/redeem-codes/random", (req, res) => {
  const count = Math.max(1, Number(req.body?.count) || 1);
  const length = Math.max(4, Number(req.body?.length) || 8);
  const quantity = Math.max(0, Number(req.body?.quantityPerCode) || 0);
  res.json({ data: generateRandomCodes(count, length, quantity) });
});

app.delete("/api/admin/redeem-codes/:code", (req, res) => {
  res.json({ data: deleteRedeemCode(req.params.code) });
});

app.post("/api/admin/assign-records", (req, res) => {
  const { code, recordIds } = req.body ?? {};
  assignRecordsToCode(code, Array.isArray(recordIds) ? recordIds : []);
  res.json({
    data: {
      records: listRecords(),
      apiConfig: getApiConfig(),
      redeemCodes: listRedeemCodes(),
    },
  });
});

app.post("/api/redeem", (req, res) => {
  const code = String(req.body?.code || "").trim();
  const records = activateRedeemCode(code);
  res.json({ data: { code, records } });
});

app.post("/api/records/sync", (req, res) => {
  res.json({ data: syncPolledRecords(req.body?.records || []) });
});

app.get("/api/issues", (_req, res) => {
  res.json({ data: listIssueReports() });
});

app.post("/api/issues", (req, res) => {
  res.json({ data: createIssueReport(req.body) });
});

app.post("/api/issues/clear", (_req, res) => {
  res.json({ data: clearIssueReports() });
});

app.post("/api/issues/delete", (req, res) => {
  res.json({ data: deleteIssueReport(req.body.id) });
});

app.delete("/api/issues", (_req, res) => {
  res.json({ data: clearIssueReports() });
});

app.delete("/api/issues/:id", (req, res) => {
  res.json({ data: deleteIssueReport(req.params.id) });
});

app.get("/api/tasks", (_req, res) => {
  res.json({ data: listPollingTasks() });
});

app.post("/api/tasks/sync", (req, res) => {
  res.json({ data: upsertPollingTasks(req.body?.tasks || []) });
});

app.use((error, _req, res, _next) => {
  res.status(400).json({ error: error instanceof Error ? error.message : "请求失败" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`API server running at http://0.0.0.0:${port}`);
});

function parsePhoneRows(input, defaultCountryCode = "86") {
  const fallbackCountryCode = String(defaultCountryCode).replace(/\D/g, "").slice(0, 4) || "86";
  const rows = String(input)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return rows.map((line, index) => {
    const [phonePart, apiPart = ""] = line.split(/\s*-{4}\s*/).map((item) => item.trim());
    const columns = phonePart.split(/[,\t，\s]+/).map((item) => item.trim()).filter(Boolean);
    let countryCode = fallbackCountryCode;
    let phone = columns[0] ?? "";

    if (columns.length >= 2 && /^\+?\d{1,4}$/.test(columns[0]) && /^\d{6,15}$/.test(columns[1])) {
      countryCode = columns[0].replace(/^\+/, "");
      phone = columns[1];
    } else {
      const normalized = phonePart.replace(/[()]/g, "").replace(/^\+/, "");
      const digits = normalized.replace(/\D/g, "");
      if (digits.length > fallbackCountryCode.length + 5 && digits.startsWith(fallbackCountryCode)) {
        countryCode = fallbackCountryCode;
        phone = digits.slice(fallbackCountryCode.length);
      } else if (digits.length > 11) {
        countryCode = digits.slice(0, digits.length - 11);
        phone = digits.slice(-11);
      } else {
        phone = digits;
      }
    }

    const valid = /^\d{6,15}$/.test(phone);

    return {
      id: `${Date.now()}-${index}-${phone}`,
      countryCode,
      phone,
      api: apiPart,
      result: "",
      status: valid ? "pending" : "failed",
      attempts: 0,
      error: valid ? undefined : "手机号格式无效",
    };
  });
}
