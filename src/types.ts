export type ApiMethod = "GET" | "POST";

export type RecordStatus = "pending" | "polling" | "completed" | "failed" | "abnormal" | "paused";

export type AppView = "redeem" | "user" | "admin";

export interface ApiConfig {
  endpoint: string;
  method: ApiMethod;
  intervalMs: number;
  timeoutMs: number;
  resultPath: string;
  requestTemplate: string;
  headersText: string;
  maxAttempts: number;
  concurrency: number;
  releaseMinutes: number;
  announcement: string;
  showStock: boolean;
  showOccupied: boolean;
  showAvailable: boolean;
}

export interface PhoneRecord {
  id: string;
  countryCode: string;
  phone: string;
  api: string;
  result: string;
  status: RecordStatus;
  attempts: number;
  assignedCode?: string;
  completedAt?: string;
  consumedAt?: string;
  lastRequestedAt?: string;
  error?: string;
}

export interface PollResult {
  id: string;
  api: string;
  result?: string;
  status: RecordStatus;
  attempts: number;
  lastRequestedAt: string;
  error?: string;
}

export interface RedeemCode {
  code: string;
  status: "unused" | "active" | "completed";
  assignedRecordIds: string[];
  completedRecordIds?: string[];
  activatedAt?: string;
  completedAt?: string;
}

export interface IssueReport {
  id: string;
  recordId: string;
  countryCode: string;
  phone: string;
  redeemCode?: string;
  issueType: string;
  detail?: string;
  hasResult: boolean;
  result?: string;
  status: RecordStatus;
  attempts: number;
  lastRequestedAt?: string;
  createdAt: string;
}

export interface PollingTask {
  taskId: string;
  recordId: string;
  countryCode: string;
  phone: string;
  redeemCode?: string;
  source: "frontend" | "backend";
  status: "polling" | "completed" | "stopped" | "failed";
  attempts: number;
  lastRequestedAt?: string;
  result?: string;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AppState {
  records: PhoneRecord[];
  apiConfig: ApiConfig;
  redeemCodes: RedeemCode[];
  issueReports: IssueReport[];
  onlineCount?: number;
}

export interface RedeemSession {
  code: string;
  records: PhoneRecord[];
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
}
