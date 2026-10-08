import { useState, useMemo, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { deleteReceipt, organizeReceipts } from "@/api/receiptStorage";
import { formatMoney, formatDate } from "@/lib/format";
import { expensesCsv, downloadFile, safeFileName } from "@/lib/csv";
import {
  useOutbox,
  applyOutbox,
  queueDelete,
  cancelOp,
  dropTripOps,
} from "@/lib/outbox";
import { useOnline } from "@/lib/network";
import {
  Plus,
  ArrowLeft,
  Wallet,
  TrendingDown,
  CreditCard,
  Calendar,
  PieChart as PieChartIcon,
  List as ListIcon,
  Pencil,
  Download,
  FileText,
  FileSpreadsheet,
  CloudOff,
  MoreHorizontal,
  Trash2,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnimatePresence, motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ConfirmDialog from "@/components/ConfirmDialog";

import ExpenseForm from "../components/expenses/ExpenseForm";
import ExpenseList from "../components/expenses/ExpenseList";

// Only needed when the Analytics tab is opened
const TripAnalytics = lazy(() => import("../components/analytics/TripAnalytics"));

export default function TripDetails() {
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get("id");
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const outbox = useOutbox();
  const online = useOnline();

  // Fetch Trip
  const {
    data: trip,
    isLoading: tripLoading,
    error: tripError,
    refetch: refetchTrip,
    fetchStatus: tripFetchStatus,
  } = useQuery({
    queryKey: ["trip", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch Expenses
  const { data: serverExpenses, isLoading: expensesLoading } = useQuery({
    queryKey: ["expenses", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("trip_id", id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch Categories
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*");
      if (error) throw error;
      return data;
    },
    initialData: [],
  });

  // What's on the server plus changes still waiting to sync (offline adds/edits, recent deletes)
  const expenses = useMemo(
    () => serverExpenses && applyOutbox(serverExpenses, outbox, id),
    [serverExpenses, outbox, id],
  );

  // Names used on this trip, most used first, offered as one-tap picks in the expense form
  const people = useMemo(() => {
    const counts = {};
    for (const e of expenses || []) {
      const name = e.assigned_to?.trim();
      if (name) counts[name] = (counts[name] || 0) + 1;
    }
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  }, [expenses]);

  // Deletes wait a few seconds before they're sent, so Undo can simply cancel them. They're kept
  // in the offline outbox, so closing the app in the meantime doesn't lose them.
  const UNDO_MS = 6000;
  const deleteExpense = (expense) => {
    const opId = queueDelete(expense, { delayMs: UNDO_MS });
    const { dismiss } = toast({
      title: "Expense deleted",
      description: `${formatMoney(expense.cost)} · ${expense.category}`,
      duration: UNDO_MS,
      action: (
        <ToastAction
          onClick={() => {
            cancelOp(opId);
            dismiss();
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  };

  const updateTripMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase
        .from("trips")
        .update({
          ...data,
          received_amount: parseFloat(data.received_amount),
          end_date: data.end_date || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      // Keep the trip's Google Drive folder name in sync
      organizeReceipts({ tripId: id });
      queryClient.invalidateQueries({ queryKey: ["trip", id] });
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      setIsEditOpen(false);
      toast({ title: "Trip updated" });
    },
    onError: (error) =>
      toast({
        variant: "destructive",
        title: "Couldn't update the trip",
        description: error.message,
      }),
  });

  // Everything that shows expense totals: this trip, the Dashboard and the sub-budget pages
  const invalidateTripData = () => {
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["tripBudgets", id] });
    queryClient.invalidateQueries({ queryKey: ["budgetExpenses"] });
  };

  const deleteTripMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("trips").delete().eq("id", id);
      if (error) throw error;

      // Its expenses go with it (cascade), so clean up their receipts in Google Drive too,
      // and forget any of its changes still waiting to sync
      await deleteReceiptFiles(serverExpenses || []);
      dropTripOps(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast({ title: `"${trip.name}" deleted` });
      navigate("/");
    },
    onError: (error) =>
      toast({
        variant: "destructive",
        title: "Couldn't delete the trip",
        description: error.message,
      }),
  });

  const handleUpdateTrip = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    updateTripMutation.mutate(Object.fromEntries(formData));
  };

  // Asks first; Undo is still offered for a few seconds after
  const confirmDeleteExpense = (expense, afterDelete) =>
    setConfirm({
      title: "Delete this expense?",
      description: `${formatMoney(expense.cost)} · ${expense.category}${
        expense.receipt_urls?.length || expense.receipt_url
          ? ". Its receipts will be deleted too."
          : ""
      }`,
      confirmLabel: "Delete",
      onConfirm: () => {
        afterDelete?.();
        deleteExpense(expense);
      },
    });

  const confirmDeleteTrip = () =>
    setConfirm({
      title: `Delete "${trip.name}"?`,
      description:
        "This deletes the trip, all its expenses and their receipts. It can't be undone.",
      confirmLabel: "Delete trip",
      onConfirm: () => deleteTripMutation.mutate(),
    });

  const handleExportCsv = async () => {
    try {
      // Sub-budget names for the spreadsheet; fine without them if they can't be loaded
      const { data: budgets } = await supabase
        .from("trip_budgets")
        .select("id, name")
        .eq("trip_id", id);
      downloadFile(
        expensesCsv(expenses || [], { budgets: budgets || [] }),
        `${safeFileName(trip.name)}_expenses.csv`,
      );
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't export the spreadsheet",
        description: err.message,
      });
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Loaded on demand: the PDF library is large and only needed here
      const { exportTripToPDF } =
        await import("../components/trips/exportTrip");
      await exportTripToPDF(trip, expenses);
    } catch (err) {
      console.error("Export failed", err);
      toast({
        variant: "destructive",
        title: "Couldn't export the PDF",
        description: err.message,
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Calculations
  const stats = useMemo(() => {
    if (!trip || !expenses) return { total: 0, remaining: 0, percent: 0 };
    const total = expenses.reduce((acc, curr) => acc + (curr.cost || 0), 0);
    const remaining = (trip.received_amount || 0) - total;
    // Not capped, so going over budget shows (e.g. 130%) and turns the bar red
    const percent = (total / (trip.received_amount || 1)) * 100;
    return { total, remaining, percent };
  }, [trip, expenses]);

  if (tripLoading || expensesLoading)
    return (
      <div className="space-y-6" role="status" aria-label="Loading trip">
        <div className="h-4 w-28 rounded bg-gray-200 animate-pulse" />
        <div className="h-8 w-2/3 rounded-lg bg-gray-200 animate-pulse" />
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-2xl bg-gray-100 animate-pulse"
            />
          ))}
        </div>
        <div className="h-40 rounded-2xl bg-gray-100 animate-pulse" />
      </div>
    );
  if (!trip && tripFetchStatus === "paused") {
    return (
      <div className="py-12 text-center">
        <CloudOff className="mx-auto mb-3 h-8 w-8 text-slate-400" />
        <h2 className="text-lg font-medium text-slate-900">You're offline</h2>
        <p className="mt-1 text-slate-500">
          This trip hasn't been opened on this device yet, so there's no saved
          copy. It will load when you're back online.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/">Back to trips</Link>
        </Button>
      </div>
    );
  }
  if (!trip) {
    // PGRST116 = no row: the trip was deleted or the link is wrong. Anything else is a load error.
    const notFound = !tripError || tripError.code === "PGRST116";
    return (
      <div className="py-12 text-center">
        <h2 className="text-lg font-medium text-slate-900">
          {notFound ? "Trip not found" : "Couldn't load this trip"}
        </h2>
        <p className="mt-1 text-slate-500">
          {notFound
            ? "It may have been deleted."
            : "Check your connection and try again."}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {!notFound && (
            <Button variant="outline" onClick={() => refetchTrip()}>
              Try again
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to="/">Back to trips</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Header */}
      <div className="mb-5 sm:mb-6">
        <Link
          to="/"
          className="-ml-2 mb-1 inline-flex h-10 items-center rounded-lg px-2 text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Trips
        </Link>

        <div className="flex items-start justify-between gap-3 md:items-center">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 break-words">
              {trip.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-500 mt-1">
              <Calendar className="w-4 h-4 shrink-0" />
              <span className="text-sm">
                {trip.start_date ? formatDate(trip.start_date) : "TBD"}
                {trip.end_date && ` – ${formatDate(trip.end_date)}`}
              </span>
            </div>
          </div>
          {/* Phones: one ⋯ menu instead of a row of buttons */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 rounded-full sm:hidden"
                aria-label="Trip actions"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreHorizontal className="h-5 w-5" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem
                disabled={!online}
                onSelect={() => setIsEditOpen(true)}
              >
                <Pencil className="h-4 w-4" /> Edit trip details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Export
              </DropdownMenuLabel>
              <DropdownMenuItem disabled={isExporting} onSelect={handleExport}>
                <FileText className="h-4 w-4" /> PDF report
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExportCsv}>
                <FileSpreadsheet className="h-4 w-4" /> Excel (CSV)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={deleteTripMutation.isPending || !online}
                className="text-red-600 focus:text-red-600"
                onSelect={confirmDeleteTrip}
              >
                <Trash2 className="h-4 w-4" /> Delete trip
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="hidden shrink-0 flex-wrap items-center gap-2 sm:flex">
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogTrigger asChild>
                {/* Only expenses work offline; trip changes need a connection */}
                <Button
                  variant="outline"
                  className="gap-2 px-3"
                  disabled={!online}
                  title={online ? undefined : "Needs a connection"}
                >
                  <Pencil className="w-4 h-4" /> Edit
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Trip Details</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleUpdateTrip} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Trip Name</Label>
                    <Input
                      id="name"
                      name="name"
                      defaultValue={trip.name}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Total Budget</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">
                        EGP
                      </span>
                      <Input
                        id="amount"
                        name="received_amount"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        className="pl-12"
                        defaultValue={trip.received_amount}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="start">Start Date</Label>
                      <Input
                        id="start"
                        name="start_date"
                        type="date"
                        defaultValue={trip.start_date}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="end">End Date</Label>
                      <Input
                        id="end"
                        name="end_date"
                        type="date"
                        defaultValue={trip.end_date}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 sm:flex sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="bg-indigo-600 text-white hover:bg-indigo-700"
                      disabled={updateTripMutation.isPending}
                    >
                      {updateTripMutation.isPending
                        ? "Saving..."
                        : "Save Changes"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2 px-3"
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {isExporting ? "Exporting…" : "Export"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem
                  className="gap-2 py-2.5"
                  onSelect={handleExport}
                >
                  <FileText className="h-4 w-4" />
                  <div>
                    <p>PDF report</p>
                    <p className="text-xs text-muted-foreground">
                      Summary and receipt photos
                    </p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 py-2.5"
                  onSelect={handleExportCsv}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <div>
                    <p>Excel (CSV)</p>
                    <p className="text-xs text-muted-foreground">
                      Every expense as a row
                    </p>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              className="gap-2 px-3 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
              disabled={deleteTripMutation.isPending || !online}
              title={online ? undefined : "Needs a connection"}
              onClick={confirmDeleteTrip}
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5 sm:mb-8">
        {/* The only way into sub-budgets, so it looks and behaves like a button */}
        <Link
          to={`/TripBudget?id=${id}`}
          className="group min-w-0 rounded-2xl border border-indigo-200 bg-indigo-50 p-3 transition-colors hover:border-indigo-300 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:p-4"
        >
          <div className="mb-1 flex items-center gap-1.5 text-indigo-600">
            <Wallet className="hidden h-4 w-4 shrink-0 sm:block" />
            <span className="text-[11px] font-bold uppercase sm:text-xs sm:tracking-wider">
              Budget
            </span>
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </div>
          <p className="text-base font-bold leading-tight text-indigo-900 sm:text-lg">
            {formatMoney(trip.received_amount)}
          </p>
          <p className="mt-1 whitespace-nowrap text-[11px] font-medium text-indigo-600 sm:text-xs">
            Sub-budgets
          </p>
        </Link>

        <div className="min-w-0 rounded-2xl border border-amber-100 bg-amber-50 p-3 sm:p-4">
          <div className="mb-1 flex items-center gap-1.5 text-amber-600">
            <CreditCard className="hidden h-4 w-4 shrink-0 sm:block" />
            <span className="text-[11px] font-bold uppercase sm:text-xs sm:tracking-wider">
              Spent
            </span>
          </div>
          <p className="text-base font-bold leading-tight text-amber-900 sm:text-lg">
            {formatMoney(stats.total)}
          </p>
        </div>

        <div
          className={`${stats.remaining < 0 ? "border-red-100 bg-red-50" : "border-emerald-100 bg-emerald-50"} min-w-0 rounded-2xl border p-3 sm:p-4`}
        >
          <div
            className={`mb-1 flex items-center gap-1.5 ${stats.remaining < 0 ? "text-red-600" : "text-emerald-600"}`}
          >
            <TrendingDown className="hidden h-4 w-4 shrink-0 sm:block" />
            <span className="text-[11px] font-bold uppercase sm:text-xs sm:tracking-wider">
              {stats.remaining < 0 ? "Over budget" : "Remaining"}
            </span>
          </div>
          <p
            className={`text-base font-bold leading-tight sm:text-lg ${stats.remaining < 0 ? "text-red-900" : "text-emerald-900"}`}
          >
            {formatMoney(Math.abs(stats.remaining))}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-6 sm:mb-8">
        <div className="flex justify-between text-xs mb-2 text-slate-500">
          <span>Budget spent</span>
          <span
            className={stats.percent > 100 ? "font-semibold text-red-600" : ""}
          >
            {stats.percent.toFixed(0)}%
          </span>
        </div>
        <Progress
          value={Math.min(100, stats.percent)}
          className={`h-3 ${stats.percent > 100 ? "bg-red-100" : "bg-gray-100"}`}
          indicatorClassName={
            stats.percent > 100
              ? "bg-red-500"
              : stats.percent > 80
                ? "bg-amber-500"
                : "bg-indigo-500"
          }
        />
      </div>

      {/* Content Tabs */}
      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="list" className="flex items-center gap-2">
            <ListIcon className="w-4 h-4" /> Expenses
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <PieChartIcon className="w-4 h-4" /> Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="pb-20">
          <ExpenseList
            expenses={expenses || []}
            categories={categories}
            tripId={id}
            onDelete={(expenseId) => {
              const expense = expenses?.find((e) => e.id === expenseId);
              if (expense) confirmDeleteExpense(expense);
            }}
            onEdit={(expense) => {
              setEditingExpense(expense);
              setShowExpenseForm(true);
            }}
            onAdd={() => {
              setEditingExpense(null);
              setShowExpenseForm(true);
            }}
          />
        </TabsContent>

        <TabsContent value="analytics" className="pb-20">
          <Suspense
            fallback={
              <div className="space-y-4">
                <div className="h-40 rounded-2xl bg-gray-100 animate-pulse" />
                <div className="h-72 rounded-2xl bg-gray-100 animate-pulse" />
              </div>
            }
          >
            <TripAnalytics
              trip={trip}
              expenses={expenses || []}
              categories={categories}
              onEdit={(expense) => {
                setEditingExpense(expense);
                setShowExpenseForm(true);
              }}
            />
          </Suspense>
        </TabsContent>
      </Tabs>

      {/* Floating Action Button (kept clear of the iPhone home bar) */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Add expense"
        onClick={() => {
          setEditingExpense(null);
          setShowExpenseForm(true);
        }}
        className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-[max(1.5rem,env(safe-area-inset-right))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-xl shadow-slate-300 transition-colors hover:bg-slate-800 dark:bg-indigo-600 dark:shadow-black/40 dark:hover:bg-indigo-700 sm:bottom-[calc(2rem+env(safe-area-inset-bottom))] sm:right-8"
      >
        <Plus className="w-6 h-6" />
      </motion.button>

      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />

      {/* Add/Edit Expense Modal (it renders its own backdrop, so closing can ask about unsaved changes) */}
      <AnimatePresence>
        {showExpenseForm && (
          <ExpenseForm
            key="expense-form"
            tripId={id}
            categories={categories}
            expenseToEdit={editingExpense}
            people={people}
            onDelete={(expense) =>
              confirmDeleteExpense(expense, () => setShowExpenseForm(false))
            }
            onClose={() => setShowExpenseForm(false)}
            onSuccess={() => {
              invalidateTripData();
              setShowExpenseForm(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Best effort: the records are already gone, so a file that fails to delete is only logged
async function deleteReceiptFiles(expenses) {
  for (const expense of expenses) {
    const urls = expense.receipt_urls?.length
      ? expense.receipt_urls
      : expense.receipt_url
        ? [expense.receipt_url]
        : [];
    for (const url of urls) {
      try {
        await deleteReceipt(url);
      } catch (err) {
        console.error("Failed to delete receipt file:", err);
      }
    }
  }
}
