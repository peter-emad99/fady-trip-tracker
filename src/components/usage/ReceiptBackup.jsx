import { useState } from "react";
import { Archive, Download, AlertTriangle, CheckCircle2 } from "lucide-react";
import { downloadReceiptBackup } from "@/api/receiptBackup";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export default function ReceiptBackup() {
  const [progress, setProgress] = useState(null); // { done, total }
  const [result, setResult] = useState(null); // { files, missing } | { error }

  const download = async () => {
    setResult(null);
    setProgress({ done: 0, total: 0 });
    try {
      setResult(await downloadReceiptBackup(setProgress));
    } catch (err) {
      console.error(err);
      setResult({ error: err.message });
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-indigo-50 p-2 rounded-xl shrink-0">
            <Archive className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900">Receipts backup</h2>
            <p className="text-xs text-slate-500">All receipts from Drive and Supabase as a .zip, by trip and expense</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={download} disabled={!!progress} className="gap-2 shrink-0">
          <Download className="w-4 h-4" /> {progress ? "Preparing…" : "Download"}
        </Button>
      </div>

      {progress && progress.total > 0 && (
        <div className="space-y-1.5">
          <Progress value={(progress.done / progress.total) * 100} className="h-2.5 bg-gray-100" indicatorClassName="bg-indigo-600" />
          <p className="text-sm text-slate-600">
            Downloading receipts… {progress.done} / {progress.total}. Keep this page open.
          </p>
        </div>
      )}

      {result?.error && (
        <p className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 shrink-0" /> Backup failed: {result.error}
        </p>
      )}
      {result && !result.error && (
        <p className={`flex items-center gap-2 text-sm rounded-xl p-3 ${result.missing ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
          {result.missing ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          Saved {result.files} files.
          {result.missing ? ` ${result.missing} couldn't be downloaded; see MISSING.txt in the zip.` : ""}
        </p>
      )}

      <p className="text-xs text-slate-500">Includes expenses.csv (every expense and its receipt files) and Supabase files no expense uses.</p>
    </div>
  );
}
