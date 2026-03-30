import { format } from "date-fns";
import { useMemo, useState } from "react";
import {
  User,
  MoreHorizontal,
  Image as ImageIcon,
  Pencil,
  Images,
  Search,
  SlidersHorizontal,
  ChevronDown,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

export default function ExpenseList({ expenses, onDelete, onEdit }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedAssignee, setSelectedAssignee] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minCost, setMinCost] = useState("");
  const [maxCost, setMaxCost] = useState("");
  const [hasNotes, setHasNotes] = useState("all");
  const [hasReceipts, setHasReceipts] = useState("all");

  const sortedExpenses = useMemo(() => {
    return [...expenses].sort((a, b) => {
      const dateDiff = new Date(b.date) - new Date(a.date);
      if (dateDiff !== 0) return dateDiff;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [expenses]);

  const categoryOptions = useMemo(() => {
    return [
      ...new Set(expenses.map((expense) => expense.category).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));
  }, [expenses]);

  const assigneeOptions = useMemo(() => {
    return [
      ...new Set(
        expenses.map((expense) => expense.assigned_to).filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));
  }, [expenses]);

  const activeFilterCount = [
    selectedCategory !== "all",
    selectedAssignee !== "all",
    Boolean(dateFrom),
    Boolean(dateTo),
    Boolean(minCost),
    Boolean(maxCost),
    hasNotes !== "all",
    hasReceipts !== "all",
  ].filter(Boolean).length;

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const filteredExpenses = useMemo(() => {
    return sortedExpenses.filter((expense) => {
      const expenseHasNotes = Boolean(expense.notes?.trim());
      const expenseHasReceipts = Boolean(
        expense.receipt_urls?.length || expense.receipt_url,
      );
      const expenseCost = Number(expense.cost || 0);
      const searchableContent = [
        expense.category,
        expense.assigned_to,
        expense.notes,
        expense.cost != null ? String(expense.cost) : "",
        expense.date,
        expense.date ? format(new Date(expense.date), "MMM d yyyy") : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (
        normalizedSearchTerm &&
        !searchableContent.includes(normalizedSearchTerm)
      ) {
        return false;
      }

      if (selectedCategory !== "all" && expense.category !== selectedCategory) {
        return false;
      }

      if (
        selectedAssignee !== "all" &&
        expense.assigned_to !== selectedAssignee
      ) {
        return false;
      }

      if (dateFrom && (!expense.date || expense.date < dateFrom)) {
        return false;
      }

      if (dateTo && (!expense.date || expense.date > dateTo)) {
        return false;
      }

      if (minCost && expenseCost < Number(minCost)) {
        return false;
      }

      if (maxCost && expenseCost > Number(maxCost)) {
        return false;
      }

      if (hasNotes === "yes" && !expenseHasNotes) {
        return false;
      }

      if (hasNotes === "no" && expenseHasNotes) {
        return false;
      }

      if (hasReceipts === "yes" && !expenseHasReceipts) {
        return false;
      }

      if (hasReceipts === "no" && expenseHasReceipts) {
        return false;
      }

      return true;
    });
  }, [
    sortedExpenses,
    normalizedSearchTerm,
    selectedCategory,
    selectedAssignee,
    dateFrom,
    dateTo,
    minCost,
    maxCost,
    hasNotes,
    hasReceipts,
  ]);

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedCategory("all");
    setSelectedAssignee("all");
    setDateFrom("");
    setDateTo("");
    setMinCost("");
    setMaxCost("");
    setHasNotes("all");
    setHasReceipts("all");
  };

  if (expenses.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
        <p className="text-slate-500">No expenses recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Collapsible
        open={isFiltersOpen}
        onOpenChange={setIsFiltersOpen}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm"
      >
        <div className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by category, notes, assignee, amount, or date"
                className="pl-9 bg-gray-50 border-gray-200"
              />
            </div>

            <div className="flex items-center gap-2 lg:shrink-0">
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <SlidersHorizontal className="w-4 h-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-indigo-100 px-1.5 text-xs font-semibold text-indigo-700">
                      {activeFilterCount}
                    </span>
                  )}
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${isFiltersOpen ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>

              {(searchTerm || activeFilterCount > 0) && (
                <Button
                  variant="ghost"
                  className="gap-2 text-slate-500 hover:text-slate-900"
                  onClick={resetFilters}
                >
                  <X className="w-4 h-4" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          <CollapsibleContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 rounded-xl border border-gray-100 bg-gray-50/70 p-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Category
                </p>
                <Select
                  value={selectedCategory}
                  onValueChange={setSelectedCategory}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categoryOptions.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Assigned To
                </p>
                <Select
                  value={selectedAssignee}
                  onValueChange={setSelectedAssignee}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="All assignees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All assignees</SelectItem>
                    {assigneeOptions.map((assignee) => (
                      <SelectItem key={assignee} value={assignee}>
                        {assignee}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  From Date
                </p>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="bg-white"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  To Date
                </p>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="bg-white"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Min Amount
                </p>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={minCost}
                  onChange={(event) => setMinCost(event.target.value)}
                  placeholder="0.00"
                  className="bg-white"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Max Amount
                </p>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={maxCost}
                  onChange={(event) => setMaxCost(event.target.value)}
                  placeholder="0.00"
                  className="bg-white"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Notes
                </p>
                <Select value={hasNotes} onValueChange={setHasNotes}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    <SelectItem value="yes">Has notes</SelectItem>
                    <SelectItem value="no">No notes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Receipts
                </p>
                <Select value={hasReceipts} onValueChange={setHasReceipts}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    <SelectItem value="yes">Has receipt</SelectItem>
                    <SelectItem value="no">No receipt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {filteredExpenses.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
          <p className="text-slate-700 font-medium">
            No expenses match your search or filters.
          </p>
          <p className="text-slate-500 text-sm mt-1">
            Try clearing some filters to see more results.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredExpenses.map((expense) => (
            <div
              key={expense.id}
              className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0 mr-2">
                <div className="h-12 w-12 shrink-0 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm uppercase">
                  {expense.category?.slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-slate-900 text-base truncate">
                    {expense.category}
                  </h4>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-600 mt-1">
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      {format(new Date(expense.date), "MMM d")}
                    </span>

                    {expense.assigned_to && (
                      <>
                        <span className="text-slate-300 hidden sm:inline">
                          |
                        </span>
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <User className="w-3 h-3" /> {expense.assigned_to}
                        </span>
                      </>
                    )}

                    {(expense.receipt_urls?.length > 0 ||
                      expense.receipt_url) && (
                      <>
                        <span className="text-slate-300 hidden sm:inline">
                          |
                        </span>
                        <Dialog>
                          <DialogTrigger asChild>
                            <button className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 transition-colors whitespace-nowrap">
                              {expense.receipt_urls?.length > 1 ? (
                                <Images className="w-3 h-3" />
                              ) : (
                                <ImageIcon className="w-3 h-3" />
                              )}
                              {expense.receipt_urls?.length > 1
                                ? `${expense.receipt_urls.length} Receipts`
                                : "Receipt"}
                            </button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-white p-6 rounded-xl">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {(expense.receipt_urls?.length > 0
                                ? expense.receipt_urls
                                : [expense.receipt_url]
                              ).map((url, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-lg overflow-hidden border border-gray-100 shadow-sm"
                                >
                                  <img
                                    src={url}
                                    alt={`Receipt ${idx + 1}`}
                                    className="w-full h-auto object-contain"
                                  />
                                </div>
                              ))}
                            </div>
                          </DialogContent>
                        </Dialog>
                      </>
                    )}
                  </div>

                  {expense.notes && (
                    <p className="text-xs text-slate-600 mt-1.5 line-clamp-2 leading-relaxed">
                      {expense.notes}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="font-bold text-slate-900 text-lg">
                  -EGP {expense.cost?.toFixed(2)}
                </span>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-400 hover:text-gray-600"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(expense)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit Details
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-600"
                      onClick={() => onDelete(expense.id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
