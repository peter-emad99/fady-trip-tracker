import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import {
  ArrowLeft,
  Wallet,
  Plus,
  Pencil,
  Trash2,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatMoney, formatDate } from "@/lib/format";
import { toast } from "@/components/ui/use-toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useOnline } from "@/lib/network";

export default function TripBudget() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [selectedBudget, setSelectedBudget] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [formError, setFormError] = useState("");
  // The amount being typed, for the "over the trip budget" warning
  const [amountDraft, setAmountDraft] = useState("");
  const queryClient = useQueryClient();
  const online = useOnline();

  // Fetch Trip
  const {
    data: trip,
    isLoading: tripLoading,
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

  // Fetch Trip Budgets with spent amount
  const { data: budgets, isLoading: budgetsLoading } = useQuery({
    queryKey: ["tripBudgets", id],
    queryFn: async () => {
      // Get budgets
      const { data: budgetsData, error: budgetsError } = await supabase
        .from("trip_budgets")
        .select("*")
        .eq("trip_id", id)
        .order("created_at", { ascending: true });

      if (budgetsError) throw budgetsError;

      // Get all expenses for this trip (for total spent)
      const { data: allExpenses, error: allExpensesError } = await supabase
        .from("expenses")
        .select("trip_budget_id, cost")
        .eq("trip_id", id);

      if (allExpensesError) throw allExpensesError;

      // Calculate total spent from all expenses
      const totalSpent = allExpenses.reduce(
        (acc, exp) => acc + (exp.cost || 0),
        0,
      );

      // Get expenses with trip_budget_id for per-budget calculation
      const expensesWithBudget = allExpenses.filter(
        (exp) => exp.trip_budget_id,
      );
      const spentByBudget = {};
      expensesWithBudget.forEach((exp) => {
        if (exp.trip_budget_id) {
          spentByBudget[exp.trip_budget_id] =
            (spentByBudget[exp.trip_budget_id] || 0) + (exp.cost || 0);
        }
      });

      // Merge spent amount into budgets and add totalSpent
      return {
        budgets: budgetsData.map((budget) => ({
          ...budget,
          spent: spentByBudget[budget.id] || 0,
          remaining: budget.amount - (spentByBudget[budget.id] || 0),
        })),
        totalSpent,
      };
    },
    enabled: !!id,
  });

  // Fetch expenses for selected budget
  const { data: budgetExpenses, isLoading: budgetExpensesLoading } = useQuery({
    queryKey: ["budgetExpenses", selectedBudget?.id],
    queryFn: async () => {
      if (!selectedBudget?.id) return [];
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("trip_budget_id", selectedBudget.id)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedBudget?.id,
  });

  // Create budget mutation
  const createBudgetMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase.from("trip_budgets").insert({
        trip_id: id,
        name: data.name,
        amount: parseFloat(data.amount),
      });
      if (error) throw error;
    },
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: ["tripBudgets", id] });
      setIsAddOpen(false);
      toast(savedToast("Sub-budget added", parseFloat(data.amount) - remainingForSubBudgets));
    },
    onError: (error) => setFormError(`Couldn't add it: ${error.message}`),
  });

  // Update budget mutation
  const updateBudgetMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase
        .from("trip_budgets")
        .update({
          name: data.name,
          amount: parseFloat(data.amount),
        })
        .eq("id", editingBudget.id);
      if (error) throw error;
    },
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: ["tripBudgets", id] });
      setIsEditOpen(false);
      toast(
        savedToast(
          "Sub-budget updated",
          parseFloat(data.amount) - remainingForSubBudgets - (editingBudget?.amount || 0),
        ),
      );
      setEditingBudget(null);
    },
    onError: (error) => setFormError(`Couldn't save it: ${error.message}`),
  });

  // Delete budget mutation
  const deleteBudgetMutation = useMutation({
    mutationFn: async (budgetId) => {
      const { error } = await supabase
        .from("trip_budgets")
        .delete()
        .eq("id", budgetId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tripBudgets", id] });
      // Its expenses lose the link (ON DELETE SET NULL), so refresh them too
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast({ title: "Sub-budget deleted" });
    },
    onError: (error) =>
      toast({
        variant: "destructive",
        title: "Couldn't delete the sub-budget",
        description: error.message,
      }),
  });

  // Calculations
  const totalBudget = trip?.received_amount || 0;
  const totalSubBudgets =
    budgets?.budgets?.reduce((acc, b) => acc + (b.amount || 0), 0) || 0;
  const remainingForSubBudgets = totalBudget - totalSubBudgets;
  const totalSpent = budgets?.totalSpent || 0;

  // Sub-budgets may add up to more than the trip budget: the form warns, but doesn't block
  const editAvailable = remainingForSubBudgets + (editingBudget?.amount || 0); // its own amount is free to reuse
  const overBy = (available) => {
    const amount = parseFloat(amountDraft);
    return amount > available ? amount - available : 0;
  };

  // Toast after saving; says so when the sub-budgets now add up to more than the trip budget
  const savedToast = (title, over) =>
    over > 0
      ? {
          title,
          description: `Sub-budgets are now ${formatMoney(over)} over the trip budget.`,
        }
      : { title };

  const handleCreateBudget = (e) => {
    e.preventDefault();
    setFormError("");
    createBudgetMutation.mutate(Object.fromEntries(new FormData(e.target)));
  };

  const handleUpdateBudget = (e) => {
    e.preventDefault();
    setFormError("");
    updateBudgetMutation.mutate(Object.fromEntries(new FormData(e.target)));
  };

  const openAdd = (open) => {
    setFormError("");
    setAmountDraft("");
    setIsAddOpen(open);
  };

  if (tripLoading || budgetsLoading)
    return (
      <div className="space-y-6" role="status" aria-label="Loading sub-budgets">
        <div className="h-8 w-2/3 rounded-lg bg-gray-200 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 rounded-2xl bg-gray-100 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  if (!trip)
    return (
      <div className="py-12 text-center">
        <h2 className="text-lg font-medium text-slate-900">
          {tripFetchStatus === "paused" ? "You're offline" : "Trip not found"}
        </h2>
        {tripFetchStatus === "paused" && (
          <p className="mt-1 text-slate-500">
            This page hasn't been opened on this device yet. It will load when
            you're back online.
          </p>
        )}
        <Button asChild variant="outline" className="mt-4">
          <Link to="/">Back to trips</Link>
        </Button>
      </div>
    );

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          to={`/TripDetails?id=${id}`}
          className="-ml-2 mb-2 inline-flex h-10 items-center rounded-lg px-2 text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Trip
        </Link>

        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
              Sub-budgets
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 break-words">
              {trip.name}
            </h1>
          </div>
          <Dialog open={isAddOpen} onOpenChange={openAdd}>
            <DialogTrigger asChild>
              {/* Sub-budget changes need a connection (only expenses work offline) */}
              <Button
                className="shrink-0 gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
                disabled={!online}
                title={online ? undefined : "Needs a connection"}
              >
                <Plus className="w-4 h-4" /> Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add sub-budget</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateBudget} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Budget Name</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="e.g., Food, Transport, Hotels"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (EGP)</Label>
                  <Input
                    id="amount"
                    name="amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    required
                    onChange={(e) => setAmountDraft(e.target.value)}
                  />
                  <LeftToAllocate
                    available={remainingForSubBudgets}
                    over={overBy(remainingForSubBudgets)}
                    tripBudget={totalBudget}
                  />
                </div>
                {formError && (
                  <p role="alert" className="text-sm text-red-600">
                    {formError}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 pt-2 sm:flex sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => openAdd(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-indigo-600 text-white hover:bg-indigo-700"
                    disabled={createBudgetMutation.isPending}
                  >
                    {createBudgetMutation.isPending
                      ? "Adding..."
                      : overBy(remainingForSubBudgets)
                        ? "Add anyway"
                        : "Add sub-budget"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {remainingForSubBudgets < 0 && (
        <div
          role="status"
          className="mb-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:p-4"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            <span className="font-semibold">Over the trip budget.</span> The
            sub-budgets add up to {formatMoney(totalSubBudgets)}, which is{" "}
            {formatMoney(-remainingForSubBudgets)} more than the trip budget of{" "}
            {formatMoney(totalBudget)}.
          </p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-6">
        {[
          {
            label: "Trip budget",
            value: totalBudget,
            icon: Wallet,
            tone: "indigo",
          },
          {
            label: "Allocated",
            value: totalSubBudgets,
            icon: Wallet,
            tone: "blue",
          },
          {
            label: "Spent",
            value: totalSpent,
            icon: TrendingDown,
            tone: "amber",
          },
          remainingForSubBudgets < 0
            ? {
                label: "Over-allocated",
                value: -remainingForSubBudgets,
                icon: Wallet,
                tone: "red",
              }
            : {
                label: "Unallocated",
                value: remainingForSubBudgets,
                icon: Wallet,
                tone: "emerald",
              },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div
            key={label}
            className={`min-w-0 p-3 sm:p-4 rounded-2xl border ${TONES[tone].card}`}
          >
            <div
              className={`flex items-center gap-1.5 mb-1 ${TONES[tone].label}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-[11px] sm:text-xs font-bold uppercase sm:tracking-wider">
                {label}
              </span>
            </div>
            <p
              className={`text-base sm:text-lg font-bold leading-tight ${TONES[tone].value}`}
            >
              {formatMoney(value)}
            </p>
          </div>
        ))}
      </div>

      {/* Budgets List */}
      <div className="space-y-3">
        {budgets?.budgets?.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            <p className="text-slate-700 font-medium">No sub-budgets yet</p>
            <p className="text-slate-500 text-sm mt-1">
              Split the trip budget into parts like Food or Hotels with the Add
              button.
            </p>
          </div>
        ) : (
          budgets?.budgets?.map((budget) => {
            const percent =
              budget.amount > 0 ? (budget.spent / budget.amount) * 100 : 0;
            const isOverBudget = budget.spent > budget.amount;

            return (
              <div
                key={budget.id}
                className="bg-card p-4 rounded-xl border border-gray-100 shadow-sm"
              >
                <div className="flex justify-between items-start gap-2 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-medium text-gray-900 break-words">
                      {budget.name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Allocated: {formatMoney(budget.amount)}
                    </p>
                  </div>
                  <div className="-mr-2 -mt-2 flex shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${budget.name}`}
                      disabled={!online}
                      onClick={() => {
                        setFormError("");
                        setAmountDraft(String(budget.amount ?? ""));
                        setEditingBudget(budget);
                        setIsEditOpen(true);
                      }}
                      className="text-gray-400 hover:text-indigo-600"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${budget.name}`}
                      disabled={!online}
                      onClick={() =>
                        setConfirm({
                          title: `Delete "${budget.name}"?`,
                          description:
                            "Its expenses stay on the trip; they just won't belong to a sub-budget any more.",
                          confirmLabel: "Delete sub-budget",
                          onConfirm: () =>
                            deleteBudgetMutation.mutate(budget.id),
                        })
                      }
                      className="text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm">
                    {budget.spent > 0 ? (
                      <button
                        onClick={() => setSelectedBudget(budget)}
                        className="-mx-1.5 -my-2 rounded-md px-1.5 py-2 text-amber-600 hover:text-amber-800 font-medium underline decoration-dotted underline-offset-4"
                      >
                        Spent: {formatMoney(budget.spent)}
                      </button>
                    ) : (
                      <span className="text-gray-400">
                        Spent: {formatMoney(0)}
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-sm font-medium ${isOverBudget ? "text-red-600" : "text-emerald-600"}`}
                  >
                    {isOverBudget
                      ? `${formatMoney(-budget.remaining)} over`
                      : `${formatMoney(budget.remaining)} remaining`}
                  </div>
                </div>

                <Progress
                  value={Math.min(percent, 100)}
                  className="h-2"
                  indicatorClassName={
                    isOverBudget
                      ? "bg-red-500"
                      : percent > 80
                        ? "bg-amber-500"
                        : "bg-indigo-500"
                  }
                />
                <div className="text-xs text-gray-400 mt-1 text-right">
                  {percent.toFixed(0)}% spent
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Edit Budget Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit sub-budget</DialogTitle>
          </DialogHeader>
          {editingBudget && (
            <form onSubmit={handleUpdateBudget} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Budget Name</Label>
                <Input
                  id="edit-name"
                  name="name"
                  defaultValue={editingBudget.name}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-amount">Amount (EGP)</Label>
                <Input
                  id="edit-amount"
                  name="amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  defaultValue={editingBudget.amount}
                  required
                  onChange={(e) => setAmountDraft(e.target.value)}
                />
                <LeftToAllocate
                  available={editAvailable}
                  over={overBy(editAvailable)}
                  tripBudget={totalBudget}
                  editing
                />
              </div>
              {formError && (
                <p role="alert" className="text-sm text-red-600">
                  {formError}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 pt-2 sm:flex sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditOpen(false);
                    setEditingBudget(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-indigo-600 text-white hover:bg-indigo-700"
                  disabled={updateBudgetMutation.isPending}
                >
                  {updateBudgetMutation.isPending
                    ? "Saving..."
                    : overBy(editAvailable)
                      ? "Save anyway"
                      : "Save changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />

      {/* Budget Expenses Dialog */}
      <Dialog
        open={!!selectedBudget}
        onOpenChange={() => setSelectedBudget(null)}
      >
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedBudget?.name}: expenses</DialogTitle>
          </DialogHeader>
          {budgetExpensesLoading ? (
            <p className="text-center py-4">Loading...</p>
          ) : budgetExpenses?.length === 0 ? (
            <p className="text-center py-4 text-gray-500">No expenses found</p>
          ) : (
            <div className="space-y-3 mt-4">
              {budgetExpenses?.map((expense) => (
                <div
                  key={expense.id}
                  className="flex justify-between items-center gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">
                      {expense.category}
                    </p>
                    <p className="text-xs text-gray-500">
                      {expense.date ? formatDate(expense.date) : "No date"}
                      {expense.notes && ` - ${expense.notes.slice(0, 30)}`}
                    </p>
                  </div>
                  <p className="font-medium text-amber-600 whitespace-nowrap">
                    {formatMoney(expense.cost)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Under the amount field: what's left, or a warning when the amount goes past it (saving still works)
function LeftToAllocate({ available, over, tripBudget, editing = false }) {
  if (!over)
    return (
      <p className="text-xs text-slate-500">
        Left to allocate{editing ? " (with this one's amount)" : ""}:{" "}
        {formatMoney(Math.max(0, available))}
      </p>
    );
  return (
    <p
      role="status"
      className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900"
    >
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600" />
      <span>
        {available > 0
          ? `That's ${formatMoney(over)} more than the ${formatMoney(available)} left to allocate.`
          : `Nothing is left to allocate, so this goes ${formatMoney(over)} over.`}{" "}
        The sub-budgets will add up to more than the trip budget (
        {formatMoney(tripBudget)}). You can still save it.
      </span>
    </p>
  );
}

// Tailwind needs whole class names in the source, so each tone's classes are spelled out
const TONES = {
  indigo: {
    card: "bg-indigo-50 border-indigo-100",
    label: "text-indigo-600",
    value: "text-indigo-900",
  },
  blue: {
    card: "bg-blue-50 border-blue-100",
    label: "text-blue-600",
    value: "text-blue-900",
  },
  amber: {
    card: "bg-amber-50 border-amber-100",
    label: "text-amber-600",
    value: "text-amber-900",
  },
  emerald: {
    card: "bg-emerald-50 border-emerald-100",
    label: "text-emerald-600",
    value: "text-emerald-900",
  },
  red: {
    card: "bg-red-50 border-red-100",
    label: "text-red-600",
    value: "text-red-900",
  },
};
