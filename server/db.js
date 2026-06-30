import fs from "node:fs";
import path from "node:path";
import Database from "libsql";

const dataDir = process.env.HS_DATA_DIR || path.resolve(process.cwd(), "..", "hs-exchange-data");
const dbPath = process.env.HS_DB_PATH || path.join(dataDir, "app.db");

fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    config_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS phone_records (
    id TEXT PRIMARY KEY,
    country_code TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    api TEXT NOT NULL,
    result TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    assigned_code TEXT,
    completed_at TEXT,
    consumed_at TEXT,
    last_requested_at TEXT,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS redeem_codes (
    code TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'unused',
    activated_at TEXT,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS redeem_code_records (
    code TEXT NOT NULL,
    record_id TEXT NOT NULL,
    completed_at TEXT,
    PRIMARY KEY (code, record_id),
    FOREIGN KEY (code) REFERENCES redeem_codes(code) ON DELETE CASCADE,
    FOREIGN KEY (record_id) REFERENCES phone_records(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS polling_tasks (
    task_id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL,
    country_code TEXT NOT NULL,
    phone TEXT NOT NULL,
    redeem_code TEXT,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_requested_at TEXT,
    result TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS issue_reports (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL,
    country_code TEXT NOT NULL,
    phone TEXT NOT NULL,
    redeem_code TEXT,
    issue_type TEXT NOT NULL,
    detail TEXT,
    has_result INTEGER NOT NULL DEFAULT 0,
    result TEXT,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_requested_at TEXT,
    created_at TEXT NOT NULL
  );
`);

try {
  db.prepare("ALTER TABLE redeem_code_records ADD COLUMN completed_at TEXT").run();
} catch {
  // 已存在该字段时忽略
}

db.exec(`
  UPDATE redeem_code_records
  SET completed_at = (
    SELECT completed_at FROM phone_records
    WHERE phone_records.id = redeem_code_records.record_id
  )
  WHERE completed_at IS NULL
    AND EXISTS (
      SELECT 1 FROM phone_records
      WHERE phone_records.id = redeem_code_records.record_id
        AND phone_records.status = 'completed'
        AND phone_records.completed_at IS NOT NULL
    );

  UPDATE phone_records
  SET status = 'completed',
      completed_at = COALESCE(completed_at, (
        SELECT completed_at FROM redeem_code_records
        WHERE redeem_code_records.record_id = phone_records.id
          AND redeem_code_records.completed_at IS NOT NULL
        LIMIT 1
      )),
      consumed_at = COALESCE(consumed_at, (
        SELECT completed_at FROM redeem_code_records
        WHERE redeem_code_records.record_id = phone_records.id
          AND redeem_code_records.completed_at IS NOT NULL
        LIMIT 1
      ))
  WHERE EXISTS (
    SELECT 1 FROM redeem_code_records
    WHERE redeem_code_records.record_id = phone_records.id
      AND redeem_code_records.completed_at IS NOT NULL
  );
`);

const defaultApiConfig = {
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
};

const configRow = db.prepare("SELECT config_json FROM app_config WHERE id = 1").get();
if (!configRow) {
  db.prepare("INSERT INTO app_config (id, config_json) VALUES (1, ?)").run(JSON.stringify(defaultApiConfig));
}

export function getApiConfig() {
  const row = db.prepare("SELECT config_json FROM app_config WHERE id = 1").get();
  return row ? { ...defaultApiConfig, ...JSON.parse(row.config_json) } : defaultApiConfig;
}

export function saveApiConfig(config) {
  db.prepare("UPDATE app_config SET config_json = ? WHERE id = 1").run(JSON.stringify(config));
  return getApiConfig();
}

export function listRecords() {
  releaseExpiredCompletedRecords();
  return db.prepare(`
    SELECT id, country_code, phone, api, result, status, attempts, assigned_code, completed_at, consumed_at, last_requested_at, error
    FROM phone_records
    ORDER BY rowid DESC
  `).all().map(mapRecord);
}

export function getRecordsByCode(code) {
  releaseExpiredCompletedRecords();
  return db.prepare(`
    SELECT r.id, r.country_code, r.phone, r.api, r.result, r.status, r.attempts, r.assigned_code, r.completed_at, r.consumed_at, r.last_requested_at, r.error
    FROM phone_records r
    INNER JOIN redeem_code_records rc ON rc.record_id = r.id
    WHERE rc.code = ?
    ORDER BY r.rowid DESC
  `).all(code).map(mapRecord);
}

export function upsertRecords(records) {
  const insert = db.prepare(`
    INSERT INTO phone_records (id, country_code, phone, api, result, status, attempts, assigned_code, completed_at, consumed_at, last_requested_at, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      country_code = excluded.country_code,
      phone = excluded.phone,
      api = excluded.api,
      result = excluded.result,
      status = excluded.status,
      attempts = excluded.attempts,
      assigned_code = excluded.assigned_code,
      completed_at = excluded.completed_at,
      consumed_at = excluded.consumed_at,
      last_requested_at = excluded.last_requested_at,
      error = excluded.error
  `);

  const tx = db.transaction((items) => {
    for (const item of items) {
      insert.run(
        item.id,
        item.countryCode,
        item.phone,
        item.api,
        item.result || "",
        item.status,
        item.attempts || 0,
        item.assignedCode || null,
        item.completedAt || null,
        item.consumedAt || null,
        item.lastRequestedAt || null,
        item.error || null
      );
    }
  });

  tx(records);
  return listRecords();
}

export function deleteRecordById(id) {
  db.prepare("DELETE FROM redeem_code_records WHERE record_id = ?").run(id);
  db.prepare("DELETE FROM phone_records WHERE id = ?").run(id);
}

export function deleteRecordsByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return listRecords();
  }

  const placeholders = ids.map(() => "?").join(",");
  const affectedCodes = db.prepare(`SELECT DISTINCT code FROM redeem_code_records WHERE record_id IN (${placeholders})`).all(...ids).map((item) => item.code);
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM polling_tasks WHERE record_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM redeem_code_records WHERE record_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM phone_records WHERE id IN (${placeholders})`).run(...ids);

    for (const code of affectedCodes) {
      refreshRedeemCodeStatus(code);
    }
  });

  tx();
  return listRecords();
}

export function releaseRecordsRedeemCode(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return listRecords();
  }

  const placeholders = ids.map(() => "?").join(",");
  const affectedCodes = db.prepare(`SELECT DISTINCT code FROM redeem_code_records WHERE record_id IN (${placeholders})`).all(...ids).map((item) => item.code);
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM polling_tasks WHERE record_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM redeem_code_records WHERE record_id IN (${placeholders})`).run(...ids);
    db.prepare(`
      UPDATE phone_records
      SET assigned_code = NULL,
          consumed_at = NULL
      WHERE id IN (${placeholders})
    `).run(...ids);

    for (const code of affectedCodes) {
      refreshRedeemCodeStatus(code);
    }
  });

  tx();
  return listRecords();
}

export function reuseCompletedRecords(ids, unbindDeleted = false) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return listRecords();
  }

  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT id, assigned_code
    FROM phone_records
    WHERE id IN (${placeholders})
  `).all(...ids);
  const existingCodes = new Set(db.prepare("SELECT code FROM redeem_codes").all().map((item) => item.code));
  const deletedCodes = Array.from(new Set(rows.map((item) => item.assigned_code).filter((code) => code && !existingCodes.has(code))));

  if (deletedCodes.length > 0 && !unbindDeleted) {
    throw new Error(`当前兑换码已删除：${deletedCodes.join("、")}`);
  }

  const affectedCodes = db.prepare(`SELECT DISTINCT code FROM redeem_code_records WHERE record_id IN (${placeholders})`).all(...ids).map((item) => item.code);
  const insertLink = db.prepare("INSERT OR REPLACE INTO redeem_code_records (code, record_id, completed_at) VALUES (?, ?, NULL)");
  const updateRecord = db.prepare(`
    UPDATE phone_records
    SET result = '',
        status = 'pending',
        attempts = 0,
        assigned_code = ?,
        completed_at = NULL,
        consumed_at = NULL,
        last_requested_at = NULL,
        error = NULL
    WHERE id = ?
  `);
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM polling_tasks WHERE record_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM redeem_code_records WHERE record_id IN (${placeholders})`).run(...ids);

    for (const row of rows) {
      const nextCode = row.assigned_code && existingCodes.has(row.assigned_code) ? row.assigned_code : null;
      updateRecord.run(nextCode, row.id);
      if (nextCode) {
        insertLink.run(nextCode, row.id);
      }
    }

    for (const code of new Set([...affectedCodes, ...rows.map((item) => item.assigned_code).filter(Boolean)])) {
      if (existingCodes.has(code)) {
        refreshRedeemCodeStatus(code);
      }
    }
  });

  tx();
  return listRecords();
}

export function updateRecordsRedeemCode(ids, code) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return listRecords();
  }

  const targetCode = String(code || "").trim();
  if (!targetCode) {
    return releaseRecordsRedeemCode(ids);
  }

  const codeRow = db.prepare("SELECT code FROM redeem_codes WHERE code = ?").get(targetCode);
  if (!codeRow) {
    throw new Error("兑换码不存在");
  }

  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT id, completed_at FROM phone_records WHERE id IN (${placeholders})`).all(...ids);
  const affectedCodes = db.prepare(`SELECT DISTINCT code FROM redeem_code_records WHERE record_id IN (${placeholders})`).all(...ids).map((item) => item.code);
  const insertLink = db.prepare("INSERT OR REPLACE INTO redeem_code_records (code, record_id, completed_at) VALUES (?, ?, ?)");
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM redeem_code_records WHERE record_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM polling_tasks WHERE record_id IN (${placeholders})`).run(...ids);
    db.prepare(`UPDATE phone_records SET assigned_code = ? WHERE id IN (${placeholders})`).run(targetCode, ...ids);
    for (const row of rows) {
      insertLink.run(targetCode, row.id, row.completed_at || null);
    }

    for (const code of new Set([...affectedCodes, targetCode])) {
      refreshRedeemCodeStatus(code);
    }
  });

  tx();
  return listRecords();
}

export function updateRecordsStatus(ids, status) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return listRecords();
  }

  const nextStatus = String(status || "").trim();
  const allowedStatuses = new Set(["pending", "failed", "abnormal", "completed", "paused"]);
  if (!allowedStatuses.has(nextStatus)) {
    throw new Error("账号状态无效");
  }

  const placeholders = ids.map(() => "?").join(",");
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const affectedCodes = db.prepare(`SELECT DISTINCT code FROM redeem_code_records WHERE record_id IN (${placeholders})`).all(...ids).map((item) => item.code);

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM polling_tasks WHERE record_id IN (${placeholders})`).run(...ids);

    if (nextStatus === "completed") {
      db.prepare(`
        UPDATE phone_records
        SET status = ?,
            completed_at = COALESCE(completed_at, ?),
            consumed_at = COALESCE(consumed_at, ?),
            last_requested_at = COALESCE(last_requested_at, ?),
            error = NULL
        WHERE id IN (${placeholders})
      `).run(nextStatus, now, now, now, ...ids);
      db.prepare(`
        UPDATE redeem_code_records
        SET completed_at = COALESCE(completed_at, ?)
        WHERE record_id IN (${placeholders})
      `).run(now, ...ids);
    } else {
      db.prepare(`
        UPDATE phone_records
        SET status = ?,
            result = CASE WHEN ? = 'pending' THEN '' ELSE result END,
            attempts = CASE WHEN ? = 'pending' THEN 0 ELSE attempts END,
            completed_at = NULL,
            consumed_at = NULL,
            last_requested_at = CASE WHEN ? = 'pending' THEN NULL ELSE last_requested_at END,
            error = CASE
              WHEN ? = 'pending' THEN NULL
              WHEN ? = 'abnormal' THEN COALESCE(error, '管理员标记异常')
              WHEN ? = 'failed' THEN COALESCE(error, '管理员标记失败')
              ELSE error
            END
        WHERE id IN (${placeholders})
      `).run(nextStatus, nextStatus, nextStatus, nextStatus, nextStatus, nextStatus, nextStatus, ...ids);
      db.prepare(`UPDATE redeem_code_records SET completed_at = NULL WHERE record_id IN (${placeholders})`).run(...ids);
    }

    for (const code of affectedCodes) {
      refreshRedeemCodeStatus(code);
    }
  });

  tx();
  return listRecords();
}

export function deleteRedeemCode(code) {
  const row = db.prepare("SELECT code FROM redeem_codes WHERE code = ?").get(code);
  if (!row) {
    throw new Error("兑换码不存在");
  }

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM polling_tasks WHERE redeem_code = ?").run(code);
    db.prepare("UPDATE phone_records SET assigned_code = NULL WHERE assigned_code = ? AND status <> 'completed' AND consumed_at IS NULL").run(code);
    db.prepare("DELETE FROM redeem_code_records WHERE code = ?").run(code);
    db.prepare("DELETE FROM redeem_codes WHERE code = ?").run(code);
  });

  tx();
  return listRedeemCodes();
}

export function listRedeemCodes() {
  releaseExpiredCompletedRecords();
  const codes = db.prepare("SELECT code, status, activated_at, completed_at FROM redeem_codes ORDER BY rowid DESC").all();
  const links = db.prepare("SELECT code, record_id, completed_at FROM redeem_code_records").all();

  return codes.map((item) => ({
    code: item.code,
    status: item.status,
    activatedAt: item.activated_at || undefined,
    completedAt: item.completed_at || undefined,
    assignedRecordIds: links.filter((link) => link.code === item.code).map((link) => link.record_id),
    completedRecordIds: links.filter((link) => link.code === item.code && link.completed_at).map((link) => link.record_id),
  }));
}

export function createRedeemCodes(codes, quantityPerCode = 0) {
  const insert = db.prepare("INSERT OR IGNORE INTO redeem_codes (code, status) VALUES (?, 'unused')");
  const availableRecordsStmt = db.prepare(`
    SELECT id FROM phone_records
    WHERE assigned_code IS NULL AND status NOT IN ('completed', 'abnormal') AND consumed_at IS NULL
    ORDER BY rowid ASC
    LIMIT ?
  `);
  const insertLink = db.prepare("INSERT INTO redeem_code_records (code, record_id) VALUES (?, ?)");
  const updateRecord = db.prepare("UPDATE phone_records SET assigned_code = ?, consumed_at = NULL WHERE id = ?");

  const tx = db.transaction((items) => {
    for (const code of items) {
      insert.run(code);

      if (quantityPerCode > 0) {
        const records = availableRecordsStmt.all(quantityPerCode);
        if (records.length < quantityPerCode) {
          throw new Error(`可分配手机号不足，兑换码 ${code} 需要 ${quantityPerCode} 个，当前仅剩 ${records.length} 个`);
        }

        for (const record of records) {
          insertLink.run(code, record.id);
          updateRecord.run(code, record.id);
        }
      }
    }
  });
  tx(codes);
  return listRedeemCodes();
}

export function generateRandomCodes(count, length, quantityPerCode = 0) {
  const total = Math.max(1, count);
  const codeLength = Math.max(4, length);
  const existing = new Set(db.prepare("SELECT code FROM redeem_codes").all().map((item) => item.code));
  const generated = [];

  while (generated.length < total) {
    const code = randomCode(codeLength);
    if (!existing.has(code) && !generated.includes(code)) {
      generated.push(code);
    }
  }

  return createRedeemCodes(generated, quantityPerCode);
}

export function assignRecordsToCode(code, recordIds) {
  const codeRow = db.prepare("SELECT code FROM redeem_codes WHERE code = ?").get(code);
  if (!codeRow) {
    throw new Error("兑换码不存在");
  }

  const duplicated = db.prepare(`
    SELECT phone FROM phone_records
    WHERE id IN (${recordIds.map(() => "?").join(",")})
      AND assigned_code IS NOT NULL
      AND assigned_code <> ?
  `).all(...recordIds, code);

  if (duplicated.length > 0) {
    throw new Error(`以下手机号已绑定其他兑换码：${duplicated.map((item) => item.phone).join("、")}`);
  }

  const clearLinks = db.prepare("DELETE FROM redeem_code_records WHERE code = ?");
  const insertLink = db.prepare("INSERT INTO redeem_code_records (code, record_id) VALUES (?, ?)");
  const updateRecord = db.prepare("UPDATE phone_records SET assigned_code = ?, consumed_at = NULL WHERE id = ?");

  const tx = db.transaction(() => {
    clearLinks.run(code);
    for (const recordId of recordIds) {
      insertLink.run(code, recordId);
      updateRecord.run(code, recordId);
    }
  });

  tx();
}

export function activateRedeemCode(code) {
  const row = db.prepare("SELECT code, status FROM redeem_codes WHERE code = ?").get(code);
  if (!row) {
    throw new Error("兑换码不存在");
  }
  if (row.status === "completed") {
    throw new Error("该兑换码已使用完成");
  }

  const records = getRecordsByCode(code);
  if (records.length === 0) {
    throw new Error("该兑换码未分配手机号");
  }

  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  db.prepare("UPDATE redeem_codes SET status = 'active', activated_at = COALESCE(activated_at, ?) WHERE code = ?").run(now, code);
  return getRecordsByCode(code);
}

export function listPollingTasks() {
  const rows = db.prepare(`
    SELECT task_id, record_id, country_code, phone, redeem_code, source, status, attempts, last_requested_at, result, error, created_at, updated_at
    FROM polling_tasks
    WHERE status = 'polling'
    ORDER BY updated_at DESC
  `).all();
  const now = Date.now();
  const staleTaskIds = rows
    .filter((row) => {
      const updatedAt = Date.parse(row.updated_at || "");
      return Number.isFinite(updatedAt) && now - updatedAt > 60000;
    })
    .map((row) => row.task_id);

  if (staleTaskIds.length > 0) {
    const placeholders = staleTaskIds.map(() => "?").join(",");
    const stoppedAt = new Date().toLocaleString("zh-CN", { hour12: false });
    db.prepare(`UPDATE polling_tasks SET status = 'stopped', updated_at = ? WHERE task_id IN (${placeholders})`).run(stoppedAt, ...staleTaskIds);
  }

  return rows.filter((row) => !staleTaskIds.includes(row.task_id)).map(mapTask);
}

export function upsertPollingTasks(tasks) {
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const upsert = db.prepare(`
    INSERT INTO polling_tasks (task_id, record_id, country_code, phone, redeem_code, source, status, attempts, last_requested_at, result, error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(task_id) DO UPDATE SET
      record_id = excluded.record_id,
      country_code = excluded.country_code,
      phone = excluded.phone,
      redeem_code = excluded.redeem_code,
      source = excluded.source,
      status = excluded.status,
      attempts = excluded.attempts,
      last_requested_at = excluded.last_requested_at,
      result = excluded.result,
      error = excluded.error,
      updated_at = excluded.updated_at
  `);

  const tx = db.transaction((items) => {
    for (const item of items) {
      upsert.run(
        item.taskId,
        item.recordId,
        item.countryCode,
        item.phone,
        item.redeemCode || null,
        item.source,
        item.status,
        item.attempts || 0,
        item.lastRequestedAt || null,
        item.result || null,
        item.error || null,
        item.createdAt || now,
        now
      );
    }
  });

  tx(tasks);
  return listPollingTasks();
}

export function listIssueReports() {
  return db.prepare(`
    SELECT id, record_id, country_code, phone, redeem_code, issue_type, detail, has_result, result, status, attempts, last_requested_at, created_at
    FROM issue_reports
    ORDER BY created_at DESC
  `).all().map(mapIssueReport);
}

export function deleteIssueReport(id) {
  db.prepare("DELETE FROM issue_reports WHERE id = ?").run(id);
  return listIssueReports();
}

export function clearIssueReports() {
  db.prepare("DELETE FROM issue_reports").run();
  return listIssueReports();
}

export function createIssueReport(report) {
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const record = db.prepare(`
    SELECT id, country_code, phone, assigned_code, result, status, attempts, last_requested_at
    FROM phone_records
    WHERE id = ?
  `).get(report?.recordId);

  if (!record) {
    throw new Error("账号不存在");
  }

  const issueType = String(report?.issueType || "其他问题").trim() || "其他问题";
  const detail = String(report?.detail || "").trim();
  const id = `${Date.now()}-${record.id}`;

  db.prepare(`
    INSERT INTO issue_reports (id, record_id, country_code, phone, redeem_code, issue_type, detail, has_result, result, status, attempts, last_requested_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    record.id,
    record.country_code,
    record.phone,
    record.assigned_code || null,
    issueType,
    detail || null,
    record.result ? 1 : 0,
    record.result || null,
    record.status,
    record.attempts || 0,
    record.last_requested_at || null,
    now
  );

  return listIssueReports();
}

export function syncPolledRecords(records) {
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const touchedCodes = new Set();

  const tx = db.transaction((items) => {
    const update = db.prepare(`
      UPDATE phone_records
      SET api = ?, result = ?, status = ?, attempts = ?, completed_at = ?, consumed_at = ?, last_requested_at = ?, error = ?
      WHERE id = ?
    `);
    const completeLink = db.prepare(`
      UPDATE redeem_code_records
      SET completed_at = COALESCE(completed_at, ?)
      WHERE code = ? AND record_id = ?
    `);

    for (const item of items) {
      const completedAt = item.status === "completed" ? item.completedAt || now : null;
      const consumedAt = item.status === "completed" ? item.consumedAt || completedAt : null;
      update.run(
        item.api,
        item.result || "",
        item.status,
        item.attempts || 0,
        completedAt,
        consumedAt,
        item.lastRequestedAt || null,
        item.error || null,
        item.id
      );

      if (item.status === "completed" && item.assignedCode) {
        completeLink.run(completedAt, item.assignedCode, item.id);
        touchedCodes.add(item.assignedCode);
      }
    }
  });

  tx(records);
  for (const code of touchedCodes) {
    completeRedeemCodeIfAllRecordsCompleted(code, now);
  }
  releaseExpiredCompletedRecords();

  return records.map((item) => ({
    ...item,
    completedAt: item.status === "completed" ? item.completedAt || now : item.completedAt,
    consumedAt: item.status === "completed" ? item.consumedAt || now : item.consumedAt,
  }));
}

function completeRedeemCodeIfAllRecordsCompleted(code, completedAt) {
  const total = db.prepare("SELECT COUNT(*) AS count FROM redeem_code_records WHERE code = ?").get(code)?.count || 0;
  if (total === 0) {
    return;
  }

  const completed = db.prepare("SELECT COUNT(*) AS count FROM redeem_code_records WHERE code = ? AND completed_at IS NOT NULL").get(code)?.count || 0;
  if (completed >= total) {
    db.prepare(`
      UPDATE redeem_codes
      SET status = 'completed', completed_at = COALESCE(completed_at, ?)
      WHERE code = ? AND status <> 'completed'
    `).run(completedAt, code);
  }
}

function refreshRedeemCodeStatus(code) {
  const total = db.prepare("SELECT COUNT(*) AS count FROM redeem_code_records WHERE code = ?").get(code)?.count || 0;
  if (total === 0) {
    db.prepare("UPDATE redeem_codes SET status = 'unused', completed_at = NULL WHERE code = ?").run(code);
    return;
  }

  const completed = db.prepare("SELECT COUNT(*) AS count FROM redeem_code_records WHERE code = ? AND completed_at IS NOT NULL").get(code)?.count || 0;
  if (completed >= total) {
    completeRedeemCodeIfAllRecordsCompleted(code, new Date().toLocaleString("zh-CN", { hour12: false }));
    return;
  }

  db.prepare("UPDATE redeem_codes SET status = 'active', completed_at = NULL WHERE code = ?").run(code);
}

function releaseExpiredCompletedRecords() {
  return;
}

function mapTask(row) {
  return {
    taskId: row.task_id,
    recordId: row.record_id,
    countryCode: row.country_code,
    phone: row.phone,
    redeemCode: row.redeem_code || undefined,
    source: row.source,
    status: row.status,
    attempts: row.attempts,
    lastRequestedAt: row.last_requested_at || undefined,
    result: row.result || undefined,
    error: row.error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapIssueReport(row) {
  return {
    id: row.id,
    recordId: row.record_id,
    countryCode: row.country_code,
    phone: row.phone,
    redeemCode: row.redeem_code || undefined,
    issueType: row.issue_type,
    detail: row.detail || undefined,
    hasResult: Boolean(row.has_result),
    result: row.result || undefined,
    status: row.status,
    attempts: row.attempts,
    lastRequestedAt: row.last_requested_at || undefined,
    createdAt: row.created_at,
  };
}

function mapRecord(row) {
  return {
    id: row.id,
    countryCode: row.country_code,
    phone: row.phone,
    api: row.api,
    result: row.result,
    status: row.status,
    attempts: row.attempts,
    assignedCode: row.assigned_code || undefined,
    completedAt: row.completed_at || undefined,
    consumedAt: row.consumed_at || undefined,
    lastRequestedAt: row.last_requested_at || undefined,
    error: row.error || undefined,
  };
}

function randomCode(length) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
