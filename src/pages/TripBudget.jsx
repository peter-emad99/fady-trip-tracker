import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import {
  ArrowLeft,
  Wallet,
  Plus,
  Pencil,
  Trash2,
  TrendingDown,
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

export default function TripBudget() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const { user } = useAuth();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const queryClient = useQueryClient();

  // Fetch Trip
  const { data: trip, isLoading: tripLoading } = useQuery({
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

      // Get expenses grouped by trip_budget_id
      const { data: expenses, error: expensesError } = await supabase
        .from("expenses")
        .select("trip_budget_id, cost")
        .eq("trip_id", id)
        .not("trip_budget_id", "is", null);

      if (expensesError) throw expensesError;

      // Calculate spent per budget
      const spentByBudget = {};
      expenses.forEach((exp) => {
        if (exp.trip_budget_id) {
          spentByBudget[exp.trip_budget_id] =
            (spentByBudget[exp.trip_budget_id] || 0) + (exp.cost || 0);
        }
      });

      // Merge spent amount into budgets
      return budgetsData.map((budget) => ({
        ...budget,
        spent: spentByBudget[budget.id] || 0,
        remaining: budget.amount - (spentByBudget[budget.id] || 0),
      }));
    },
    enabled: !!id,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tripBudgets", id] });
      setIsAddOpen(false);
    },
    onError: (error) => {
      console.error("Create budget failed:", error.message);
      alert(`Failed to create budget: ${error.message}`);
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tripBudgets", id] });
      setIsEditOpen(false);
      setEditingBudget(null);
    },
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
    },
  });

  const handleCreateBudget = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    createBudgetMutation.mutate(Object.fromEntries(formData));
  };

  const handleUpdateBudget = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    updateBudgetMutation.mutate(Object.fromEntries(formData));
  };

  // Calculations
  const totalBudget = budgets?.reduce((acc, b) => acc + (b.amount || 0), 0) || 0;
  const totalSpent = budgets?.reduce((acc, b) => acc + (b.spent || 0), 0) || 0;
  const totalRemaining = totalBudget - totalSpent;
  const usedPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  if (tripLoading || budgetsLoading)
    return (
      <div className="p-8 text-center animate-pulse">Loading budgets...</div>
    );
  if (!trip) return <div className="p-8 text-center text-red-500">Trip not found</div>;

  return (
    <div className="min-h-[calc(100vh-100px)]">
      {/* Header */}
      <div className="mb-6">
        <Link
          to={`/TripDetails?id=${id}`}
          className="inline-flex items-center text-slate-500 hover:text-slate-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Trip
        </Link>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Trip Budgets</h1>
            <p className="text-slate-500 mt-1">{trip.name}</p>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-indigo-600">
                <Plus className="w-4 h-4" /> Add Budget
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Sub-Budget</DialogTitle>
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
                    step="0.01"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="pt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-indigo-600">
                    Create
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
          <div className="flex items-center gap-2 mb-1 text-indigo-600">
            <Wallet className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">
              Total Budget
            </span>
          </div>
          <p className="text-lg font-bold text-indigo-900">
            EGP {totalBudget.toLocaleString()}
          </p>
        </div>

        <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
          <div className="flex items-center gap-2 mb-1 text-amber-600">
            <TrendingDown className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">
              Used
            </span>
          </div>
          <p className="text-lg font-bold text-amber-900">
            EGP {totalSpent.toLocaleString()}
          </p>
        </div>

        <div
          className={`${totalRemaining < 0 ? "bg-red-50 border-red-100" : "bg-emerald-50 border-emerald-100"} p-4 rounded-2xl border`}
        >
          <div
            className={`flex items-center gap-2 mb-1 ${totalRemaining < 0 ? "text-red-600" : "text-emerald-600"}`}
          >
            <Wallet className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">
              Remaining
            </span>
          </div>
          <p
            className={`text-lg font-bold ${totalRemaining < 0 ? "text-red-900" : "text-emerald-900"}`}
          >
            EGP {totalRemaining.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between text-xs mb-2 text-slate-500">
          <span>Total Budget Used</span>
          <span>{usedPercent.toFixed(0)}%</span>
        </div>
        <Progress
          value={usedPercent}
          className="h-3"
          indicatorClassName={
            usedPercent > 100
              ? "bg-red-500"
              : usedPercent > 80
                ? "bg-amber-500"
                : "bg-indigo-500"
          }
        />
      </div>

      {/* Budgets List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Budget Name
                </th>
                <th className="text-right px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Allocated
                </th>
                <th className="text-right px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Used
                </th>
                <th className="text-right px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Remaining
                </th>
                <th className="text-center px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Progress
                </th>
                <th className="text-right px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {budgets?.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-gray-400"
                  >
                    No budgets yet. Click "Add Budget" to create one.
                  </td>
                </tr>
              ) : (
                budgets?.map((budget) => {
                  const percent =
                    budget.amount > 0
                      ? (budget.spent / budget.amount) * 100
                      : 0;
                  const isOverBudget = budget.spent > budget.amount;

                  return (
                    <tr key={budget.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <span className="font-medium text-gray-900 whitespace-nowrap">
                          {budget.name}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-gray-600 whitespace-nowrap">
                        EGP {budget.amount?.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right text-amber-600 whitespace-nowrap">
                        EGP {budget.spent?.toLocaleString()}
                      </td>
                      <td
                        className={`px-6 py-4 text-right font-medium whitespace-nowrap ${isOverBudget ? "text-red-600" : "text-emerald-600"}`}
                      >
                        EGP {budget.remaining?.toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Progress
                            value={Math.min(percent, 100)}
                            className="flex-1 h-2"
                            indicatorClassName={
                              isOverBudget
                                ? "bg-red-500"
                                : percent > 80
                                  ? "bg-amber-500"
                                  : "bg-indigo-500"
                            }
                          />
                          <span className="text-xs text-gray-400 whitespace-nowrap">
                            {percent.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingBudget(budget);
                              setIsEditOpen(true);
                            }}
                            className="p-1 text-gray-400 hover:text-indigo-600"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  "Are you sure you want to delete this budget?"
                                )
                              ) {
                                deleteBudgetMutation.mutate(budget.id);
                              }
                            }}
                            className="p-1 text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Budget Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Budget</DialogTitle>
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
                  step="0.01"
                  defaultValue={editingBudget.amount}
                  required
                />
              </div>
              <div className="pt-4 flex justify-end gap-2">
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
                <Button type="submit" className="bg-indigo-600">
                  Save Changes
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}