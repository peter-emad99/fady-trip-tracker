import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { migrateLegacyReceipt } from "@/api/receiptStorage";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Copies receipts still stored in Supabase Storage to Google Drive, one file at a time, and points the
// expenses at the Drive copies. Supabase files are never deleted here.
// Safe to run again: it only picks up receipts that still point at Supabase.
export default function LegacyReceiptMigration({ driveReady, onFinished }) {
  const [progress, setProgress] = useState(null); // { done, total }
  const [result, setResult] = useState(null); // { moved, resized, failed: [{ url, message }] }

  const legacyQuery = useQuery({
    queryKey: ["usage", "legacy-receipts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_legacy_receipts");
      if (error) throw error;
      return data;
    },
  });

  // One entry per file, in case the same file is used by more than one expense
  const files = useMemo(() => {
    const byUrl = new Map();
    for (const { url, expense_id } of Array.isArray(legacyQuery.data) ? legacyQuery.data : []) {
      byUrl.set(url, [...(byUrl.get(url) || []), expense_id]);
    }
    return [...byUrl].map(([url, expenseIds]) => ({ url, expenseIds }));
  }, [legacyQuery.data]);

  const running = progress !== null;

  // Warn before leaving the page mid-migration
  useEffect(() => {
    if (!running) return;
    const warn = (e) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const migrate = async () => {
    const summary = { moved: 0, resized: 0, failed: [] };
    setResult(null);
    setProgress({ done: 0, total: files.length });

    for (const [i, { url, expenseIds }] of files.entries()) {
      try {
        const { resized } = await migrateLegacyReceipt(url, expenseIds);
        summary.moved += 1;
        if (resized) summary.resized += 1;
      } catch (err) {
        summary.failed.push({ url, message: err.message });
      }
      setProgress({ done: i + 1, total: files.length });
    }

    setProgress(null);
    setResult(summary);
    legacyQuery.refetch();
    onFinished?.();
  };

  if (legacyQuery.isLoading) return null;

  if (legacyQuery.error) {
    return (
      <p className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl p-3">
        <AlertTriangle className="w-4 h-4 shrink-0" /> Couldn't check old receipts: {legacyQuery.error.message}
      </p>
    );
  }

  return (
    <div className="space-y-3 pt-2 border-t border-gray-100">
      {running ? (
        <div className="space-y-1.5">
          <Progress value={(progress.done / progress.total) * 100} className="h-2.5 bg-gray-100" indicatorClassName="bg-indigo-600" />
          <p className="text-sm text-slate-600">
            Copying receipts… {progress.done} / {progress.total}. Keep this page open.
          </p>
        </div>
      ) : files.length > 0 ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{files.length}</span> receipt{files.length > 1 ? "s" : ""} still
            still used from Supabase Storage.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" className="gap-2 bg-indigo-600 text-white hover:bg-indigo-700 shrink-0" disabled={!driveReady}>
                <ArrowRightLeft className="w-4 h-4" /> Copy to Google Drive
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Copy {files.length} receipts to Google Drive?</AlertDialogTitle>
                <AlertDialogDescription>
                  Each receipt is copied to Google Drive and checked, then the expense is switched to the Drive
                  copy. Nothing is deleted from Supabase. Download a backup first if you haven't. Keep this page
                  open until it finishes; if it stops, run it again and it continues with what's left.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={migrate} className="bg-indigo-600 text-white hover:bg-indigo-700">
                  Copy receipts
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4" /> All receipts are in Google Drive.
        </p>
      )}

      {!driveReady && files.length > 0 && !running && (
        <p className="text-xs text-slate-500">Google Drive needs to be connected before receipts can be copied.</p>
      )}

      {result && (
        <div className={`text-sm rounded-xl p-3 space-y-1 ${result.failed.length ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
          <p>
            Copied {result.moved} receipt{result.moved === 1 ? "" : "s"} to Drive
            {result.failed.length ? `, ${result.failed.length} failed` : ""}.
          </p>
          <p className="text-xs">The Supabase copies were kept.</p>
          {result.resized > 0 && (
            <p className="text-xs">
              {result.resized} file{result.resized === 1 ? " was" : "s were"} over 4 MB, so the Drive copy was resized.
            </p>
          )}
          {result.failed.slice(0, 5).map((f) => (
            <p key={f.url} className="text-xs break-all">
              • {decodeURIComponent(f.url.split("/").pop())}: {f.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
