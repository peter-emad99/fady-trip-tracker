import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, Database, HardDrive, Cloud, RefreshCw, AlertTriangle, Lock } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import LegacyReceiptMigration from "@/components/usage/LegacyReceiptMigration";
import ReceiptBackup from "@/components/usage/ReceiptBackup";

// Supabase free plan limits
const DB_LIMIT_BYTES = 500 * 1024 * 1024;
const SUPABASE_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function levelClasses(percent) {
  if (percent >= 90) return { bar: "bg-red-500", text: "text-red-600" };
  if (percent >= 75) return { bar: "bg-amber-500", text: "text-amber-600" };
  return { bar: "bg-indigo-600", text: "text-indigo-600" };
}

function UsageCard({ icon: Icon, title, subtitle, used, limit, children, error }) {
  const percent = limit ? Math.min(100, (used / limit) * 100) : 0;
  const level = levelClasses(percent);

  return (
    <div className="bg-card rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-indigo-50 p-2 rounded-xl shrink-0">
            <Icon className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
        {!error && limit ? (
          <span className={`text-lg font-bold shrink-0 ${level.text}`}>{percent.toFixed(1)}%</span>
        ) : null}
      </div>

      {error ? (
        <p className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </p>
      ) : (
        <>
          {limit ? (
            <div className="space-y-1.5">
              <Progress value={percent} className="h-2.5 bg-gray-100" indicatorClassName={level.bar} />
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{formatBytes(used)}</span> of {formatBytes(limit)} used
                {" · "}
                {formatBytes(Math.max(0, limit - used))} left
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{formatBytes(used)}</span> used (no limit)
            </p>
          )}
          {children}
        </>
      )}
    </div>
  );
}

// Just Trippy's own files, as a share of the whole Drive account
function TrippyFolderUsage({ drive }) {
  if (!drive) return null;
  const total = drive.limit || drive.usage || 0;
  const percent = total ? (drive.receiptsBytes / total) * 100 : 0;

  return (
    <div className="bg-indigo-50/60 rounded-xl p-3 space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">Trippy Receipts folder</span>
        <span className="text-sm font-semibold text-indigo-700 shrink-0">{formatBytes(drive.receiptsBytes)}</span>
      </div>
      <Progress value={Math.max(percent, drive.receiptsBytes ? 0.5 : 0)} className="h-1.5 bg-card" indicatorClassName="bg-indigo-400" />
      <p className="text-xs text-slate-500">
        {(drive.receiptsCount ?? 0).toLocaleString()} file{drive.receiptsCount === 1 ? "" : "s"} ·{" "}
        {percent < 0.1 && drive.receiptsBytes ? "<0.1" : percent.toFixed(1)}% of this account&apos;s{" "}
        {drive.limit ? "storage" : "used space"}
      </p>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3 text-sm py-1.5 border-t border-gray-50 first:border-t-0">
      <span className="text-slate-600 truncate">{label}</span>
      <span className="font-medium text-slate-900 shrink-0">{value}</span>
    </div>
  );
}

export default function Usage() {
  const { isAdmin } = useAuth();

  const dbQuery = useQuery({
    queryKey: ["usage", "db"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_usage_stats");
      if (error) throw error;
      return data;
    },
  });

  const driveQuery = useQuery({
    queryKey: ["usage", "drive"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/usage", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      // Plain `vite` dev has no /api functions and answers with index.html instead
      if (!res.headers.get("content-type")?.includes("application/json")) {
        throw new Error("the /api server isn't running here (use `npx vercel dev` locally, or check the Vercel deployment)");
      }
      const body = await res.json();
      if (!res.ok || !body.drive) throw new Error(body.error || `Request failed (${res.status})`);
      return body.drive;
    },
  });

  const refresh = () => {
    dbQuery.refetch();
    driveQuery.refetch();
  };
  const isFetching = dbQuery.isFetching || driveQuery.isFetching;

  const db = dbQuery.data;
  const drive = driveQuery.data;
  const legacyStorageBytes = db?.storage_buckets?.reduce((sum, b) => sum + Number(b.bytes || 0), 0) ?? 0;

  if (isAdmin === null) {
    return <div className="h-40 bg-card rounded-2xl border border-gray-100 animate-pulse" />;
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-16 space-y-3">
        <Lock className="w-8 h-8 text-slate-300 mx-auto" />
        <p className="text-slate-600">Only admins can see this page.</p>
        <Link to="/" className="inline-flex items-center text-indigo-600 hover:text-indigo-700">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Trips
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="-ml-2 mb-1 inline-flex h-10 items-center rounded-lg px-2 text-slate-500 transition-colors hover:text-slate-900">
          <ArrowLeft className="w-4 h-4 mr-1" /> Trips
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Usage</h1>
            <p className="text-slate-500 mt-1">Database and storage limits</p>
          </div>
          <Button variant="outline" onClick={refresh} disabled={isFetching} className="gap-2 shrink-0">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {dbQuery.isLoading ? (
        <div className="h-40 bg-card rounded-2xl border border-gray-100 animate-pulse" />
      ) : (
        <UsageCard
          icon={Database}
          title="Database"
          subtitle="Supabase Postgres · free plan limit 500 MB"
          used={db?.db_size_bytes}
          limit={DB_LIMIT_BYTES}
          error={dbQuery.error && `Couldn't load database stats: ${dbQuery.error.message}`}
        >
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Tables</p>
            {db?.tables?.map((t) => (
              <Row
                key={t.name}
                label={t.name}
                value={`${Number(t.rows).toLocaleString()} rows · ${formatBytes(t.total_bytes)}`}
              />
            ))}
          </div>
        </UsageCard>
      )}

      {driveQuery.isLoading ? (
        <div className="h-40 bg-card rounded-2xl border border-gray-100 animate-pulse" />
      ) : (
        <UsageCard
          icon={Cloud}
          title="Google Drive"
          subtitle="Receipt storage · quota is shared with Gmail & Photos"
          used={drive?.usage}
          limit={drive?.limit}
          error={driveQuery.error && `Couldn't load Google Drive stats: ${driveQuery.error.message}`}
        >
          <TrippyFolderUsage drive={drive} />
          <div>
            <Row
              label="Account"
              value={drive?.accountName ? `${drive.accountName} (${drive.accountEmail})` : drive?.accountEmail || "Unknown"}
            />
            <Row label="Drive files (all)" value={formatBytes(drive?.usageInDrive)} />
            <Row label="Drive trash" value={formatBytes(drive?.usageInTrash)} />
          </div>
        </UsageCard>
      )}

      {!dbQuery.isLoading && (
        <UsageCard
          icon={HardDrive}
          title="Supabase Storage"
          subtitle="Older receipts · free plan limit 1 GB"
          used={legacyStorageBytes}
          limit={SUPABASE_STORAGE_LIMIT_BYTES}
          error={dbQuery.error && `Couldn't load Supabase Storage stats: ${dbQuery.error.message}`}
        >
          {db?.storage_buckets?.length ? (
            <div>
              {db.storage_buckets.map((b) => (
                <Row
                  key={b.name}
                  label={b.name}
                  value={`${Number(b.objects).toLocaleString()} files · ${formatBytes(b.bytes)}`}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No files left in Supabase Storage.</p>
          )}
          <LegacyReceiptMigration driveReady={!!drive} onFinished={refresh} />
        </UsageCard>
      )}

      <ReceiptBackup />

      <p className="text-xs text-slate-400 text-center">
        Bandwidth (egress) and monthly active users aren't exposed to the app — check them in the Supabase dashboard.
      </p>
    </div>
  );
}
