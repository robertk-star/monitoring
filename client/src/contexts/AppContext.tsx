/**
 * SaffHire - Shared App Context
 * All data is fetched through the backend API proxy.
 * No external data source URLs are exposed in the browser.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { SafetyReport } from "@/pages/SafetyPerformance";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/contexts/LocalAuthContext";
import { toast } from "sonner";

export interface Applicant {
  id: string;
  name: string;
  fileNumber: string;
  orderDate: string;
  monitorStatus: "On" | "Off";
  mvrStatus: string;
  medExpire: string;
  /** True when the Med Expire date was manually overridden from the dashboard (column C of the Med Expire sheet has a value) */
  medExpireOverridden: boolean;
  notes: string;
}

/** New DS6 row shape returned by the monitoring sheet */
interface DS6Row {
  id?: string | number;
  fileNumber: string;
  name: string;
  orderDate: string;
  monitorStatus: string;
  mvrStatus?: string;
  medExpire?: string;
  medExpireOverridden?: boolean;
  notes?: string;
}

interface MonitoringApplicantsResponse {
  status: string;
  source?: "supabase" | "google" | "google-fallback";
  message?: string;
  data: DS6Row[];
}

interface MedCertRow {
  "File #": number | string;
  "Exp Date": string;
}

/** Convert any date string or value to MM-DD-YYYY */
function formatDate(raw: unknown): string {
  if (!raw) return "";
  const str = String(raw).trim();
  if (!str) return "";

  // Already in MM-DD-YYYY format — return as-is
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) return str;

  // Try parsing as a date (handles ISO, "Fri Feb 05 2027 00:00:00 GMT-0600", etc.)
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    // Use local date parts to avoid UTC-offset shifting the day
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const y = d.getFullYear();
    return `${m}-${day}-${y}`;
  }

  return str;
}

function normalizeMonitorStatus(raw: unknown): "On" | "Off" {
  const monitorRaw = String(raw ?? "").trim();
  return monitorRaw === "On" || monitorRaw === "Yes" ? "On" : "Off";
}

function ds6RowToApplicant(
  row: DS6Row,
  index: number,
  medMap: Map<string, string>,
  notesMap: Map<string, string>,
  overrideMap: Map<string, boolean>
): Applicant {
  const fileNum = String(row.fileNumber ?? "").trim();

  return {
    id: String(row.id ?? index + 1),
    name: String(row.name ?? "").trim().toUpperCase(),
    fileNumber: fileNum,
    orderDate: formatDate(row.orderDate),
    monitorStatus: normalizeMonitorStatus(row.monitorStatus),
    mvrStatus: String(row.mvrStatus ?? "").trim(),
    medExpire: row.medExpire ? formatDate(row.medExpire) : medMap.get(fileNum) ?? "",
    medExpireOverridden: typeof row.medExpireOverridden === "boolean" ? row.medExpireOverridden : overrideMap.get(fileNum) ?? false,
    notes: row.notes ?? notesMap.get(fileNum) ?? "",
  };
}

async function fetchSupabaseApplicants(companyId: number): Promise<MonitoringApplicantsResponse> {
  const res = await fetch(`/api/monitoring/applicants?companyId=${encodeURIComponent(companyId)}`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Supabase monitoring read failed: ${res.status}`);
  }
  return res.json();
}

function showReadOnlyMigrationMessage() {
  toast.info("Editing is temporarily disabled in this migration build so the old Google Sheets data cannot be overwritten.");
}

interface AppContextValue {
  applicants: Applicant[];
  setApplicants: React.Dispatch<React.SetStateAction<Applicant[]>>;
  reports: SafetyReport[];
  setReports: React.Dispatch<React.SetStateAction<SafetyReport[]>>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  skipAutoRefetch: boolean;
  setSkipAutoRefetch: (skip: boolean) => void;
  writeMonitorStatus: (fileNumber: string, status: "On" | "Off", applicantName?: string) => Promise<void>;
  writeNote: (fileNumber: string, notes: string) => Promise<void>;
  writeMedExpire: (fileNumber: string, medExpire: string) => Promise<void>;
  saveSafetyReport: (data: Partial<SafetyReport>) => Promise<SafetyReport>;
  deleteSafetyReportById: (id: number) => Promise<void>;
  reportsLoading: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [reports, setReports] = useState<SafetyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchTick, setFetchTick] = useState(0);
  const [skipAutoRefetch, setSkipAutoRefetch] = useState(false);

  const refetch = useCallback(() => { setSkipAutoRefetch(false); setFetchTick((t) => t + 1); }, []);

  const { isAuthenticated, isLoading: authLoading, selectedCompanyId } = useLocalAuth();
  const utils = trpc.useUtils();

  // Load safety reports from DB (scoped to selected company)
  const { data: dbReports, isLoading: reportsLoading, refetch: refetchReports } = trpc.safetyReports.list.useQuery(
    selectedCompanyId ? { companyId: selectedCompanyId } : undefined,
    { enabled: isAuthenticated && !authLoading && !!selectedCompanyId }
  );

  const upsertMutation = trpc.safetyReports.upsert.useMutation();
  const deleteReportMutation = trpc.safetyReports.delete.useMutation();

  // Sync DB reports into local state whenever data arrives
  useEffect(() => {
    if (dbReports) {
      setReports(dbReports as SafetyReport[]);
    }
  }, [dbReports]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !selectedCompanyId) {
      setLoading(false);
      return;
    }

    // Skip automatic refetch if user is actively editing (search is active)
    if (skipAutoRefetch) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const loadLegacyGoogleMonitoring = async () => {
      // Fetch applicants (DS6), med certs (DS2), notes (DS3), and med expire dates (DS5) in parallel
      const companyInput = { companyId: selectedCompanyId };
      const [applicantsResult, medCertsResult, notesResult, medExpireResult] = await Promise.allSettled([
        utils.data.applicants.fetch(companyInput),
        utils.data.medCerts.fetch(),
        utils.data.notes.fetch(companyInput),
        utils.data.medExpireDates.fetch(companyInput),
      ]);

      const applicantsJson = applicantsResult.status === "fulfilled" ? applicantsResult.value : { status: "error", data: [] };
      const medCertsJson = medCertsResult.status === "fulfilled" ? medCertsResult.value : { status: "error", data: [] };
      const notesJson = notesResult.status === "fulfilled" ? notesResult.value : { status: "error", data: [] };
      const medExpireJson = medExpireResult.status === "fulfilled" ? medExpireResult.value : { status: "error", data: [] };

      if (applicantsJson.status !== "ok" || !Array.isArray(applicantsJson.data)) {
        throw new Error("Unexpected response from data source");
      }

      // Build File # → Med Expiry date map (DS2 base, DS5 overrides)
      // Also build File # → override flag map (DS5: column C has a value)
      const medMap = new Map<string, string>();
      const overrideMap = new Map<string, boolean>();
      if (medCertsJson.status === "ok" && Array.isArray(medCertsJson.data)) {
        (medCertsJson.data as MedCertRow[]).forEach((row) => {
          const key = String(row["File #"]).trim();
          if (key) medMap.set(key, formatDate(row["Exp Date"]));
        });
      }
      if (medExpireJson?.status === "ok" && Array.isArray(medExpireJson.data)) {
        medExpireJson.data.forEach((row: { fileNumber: string; medExpire: string; overwrite?: string }) => {
          const key = String(row.fileNumber).trim();
          if (key && row.medExpire) medMap.set(key, row.medExpire);
          // Mark as overridden if column C (overwrite) has a non-empty value
          if (key && row.overwrite) overrideMap.set(key, true);
        });
      }

      // Build File # → Notes map (DS3)
      const notesMap = new Map<string, string>();
      if (notesJson.status === "ok" && Array.isArray(notesJson.data)) {
        notesJson.data.forEach((row) => {
          const key = String(row.fileNumber).trim();
          if (key && row.notes) notesMap.set(key, row.notes);
        });
      }

      // Deduplicate by fileNumber — last occurrence wins
      const seen = new Map<string, DS6Row>();
      (applicantsJson.data as DS6Row[]).forEach((row) => {
        const key = String(row.fileNumber ?? "").trim();
        if (key) seen.set(key, row);
      });

      const unique = Array.from(seen.values());
      return unique.map((row, i) => ds6RowToApplicant(row, i, medMap, notesMap, overrideMap));
    };

    const loadMonitoring = async () => {
      try {
        const supabaseJson = await fetchSupabaseApplicants(selectedCompanyId);
        if (cancelled) return;

        if (supabaseJson.status === "ok" && Array.isArray(supabaseJson.data) && supabaseJson.data.length > 0) {
          setApplicants(supabaseJson.data.map((row, i) => ds6RowToApplicant(row, i, new Map(), new Map(), new Map())));
          setLoading(false);
          return;
        }

        console.info(supabaseJson.message ?? "No Supabase applicants found yet. Falling back to legacy data source.");
      } catch (supabaseError) {
        console.warn("Supabase monitoring read failed. Falling back to legacy data source.", supabaseError);
      }

      const legacyApplicants = await loadLegacyGoogleMonitoring();
      if (cancelled) return;
      setApplicants(legacyApplicants);
      setLoading(false);
    };

    loadMonitoring().catch((err: Error) => {
      if (cancelled) return;
      setError(err.message ?? "Failed to load data");
      setLoading(false);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchTick, isAuthenticated, authLoading, selectedCompanyId, skipAutoRefetch]);

  const upsertReadOnlyToast = useCallback(async () => {
    showReadOnlyMigrationMessage();
  }, []);

  const writeMonitorStatus = useCallback(async (_fileNumber: string, _status: "On" | "Off", _applicantName?: string) => {
    // Phase 2A changes reads only. This migration build intentionally does not write to old Google Sheets.
    await upsertReadOnlyToast();
  }, [upsertReadOnlyToast]);

  const writeNote = useCallback(async (_fileNumber: string, _notes: string) => {
    await upsertReadOnlyToast();
  }, [upsertReadOnlyToast]);

  const writeMedExpire = useCallback(async (_fileNumber: string, _medExpire: string) => {
    await upsertReadOnlyToast();
  }, [upsertReadOnlyToast]);

  const saveSafetyReport = useCallback(async (data: Partial<SafetyReport>): Promise<SafetyReport> => {
    // Always inject the current companyId so the report is scoped to the right company
    const dataWithCompany = selectedCompanyId
      ? { ...data, companyId: selectedCompanyId }
      : data;
    const saved = await upsertMutation.mutateAsync(dataWithCompany as Parameters<typeof upsertMutation.mutateAsync>[0]);
    await refetchReports();
    return saved as SafetyReport;
  }, [upsertMutation, refetchReports, selectedCompanyId]);

  const deleteSafetyReportById = useCallback(async (id: number): Promise<void> => {
    await deleteReportMutation.mutateAsync({ id });
    setReports((prev) => prev.filter((r) => r.id !== id));
    toast.success("Report deleted");
  }, [deleteReportMutation]);

  return (
    <AppContext.Provider
      value={{ applicants, setApplicants, reports, setReports, loading, error, refetch, skipAutoRefetch, setSkipAutoRefetch, writeMonitorStatus, writeNote, writeMedExpire, saveSafetyReport, deleteSafetyReportById, reportsLoading }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
