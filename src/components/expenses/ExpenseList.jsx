import { useEffect, useMemo, useState } from "react";
import { formatMoney, formatDate } from "@/lib/format";
import {
  User,
  Image as ImageIcon,
  Pencil,
  Images,
  Search,
  SlidersHorizontal,
  ChevronDown,
  X,
  Plus,
  Trash2,
  CloudUpload,
  AlertTriangle,
} from "lucide-react";
import ReceiptImage from "./ReceiptImage";
import { categoryTone, categoryColorMap } from "@/lib/categoryColor";
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
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const DEFAULT_FILTERS = {
  searchTerm: "",
  selectedCategory: "all",
  selectedAssignee: "all",
  dateFrom: "",
  dateTo: "",
  minCost: "",
  maxCost: "",
  hasNotes: "all",
  hasReceipts: "all",
};

// Filters are remembered per trip on this device, so they survive leaving and coming back
function loadFilters(storageKey) {
  try {
    const saved = storageKey && JSON.parse(localStorage.getItem(storageKey));
    return saved ? { ...DEFAULT_FILTERS, ...saved } : DEFAULT_FILTERS;
  } catch {
    return DEFAULT_FILTERS;
  }
}

export default function ExpenseList({
  expenses,
  tripId,
  onDelete,
  onEdit,
  onAdd,
  categories = [],
}) {
  const colors = useMemo(() => categoryColorMap(categories), [categories]);
  const storageKey = tripId ? `trippy.expenseFilters.${tripId}` : null;
  const [filters, setFilters] = useState(() => loadFilters(storageKey));
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const {
    searchTerm,
    selectedCategory,
    selectedAssignee,
    dateFrom,
    dateTo,
    minCost,
    maxCost,
    hasNotes,
    hasReceipts,
  } = filters;
  const setFilter = (key) => (value) =>
    setFilters((prev) => ({ ...prev, [key]: value }));
  const setSearchTerm = setFilter("searchTerm");
  const setSelectedCategory = setFilter("selectedCategory");
  const setSelectedAssignee = setFilter("selectedAssignee");
  const setDateFrom = setFilter("dateFrom");
  const setDateTo = setFilter("dateTo");
  const setMinCost = setFilter("minCost");
  const setMaxCost = setFilter("maxCost");
  const setHasNotes = setFilter("hasNotes");
  const setHasReceipts = setFilter("hasReceipts");

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(filters));
    } catch {
      // Storage can be unavailable (private mode); filters just won't be remembered
    }
  }, [storageKey, filters]);

  const sortedExpenses = useMemo(() => {
    return [...expenses].sort((a, b) => {
      // "YYYY-MM-DD" strings sort correctly as text
      const dateDiff = (b.date || "").localeCompare(a.date || "");
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
        formatDate(expense.date, "MMM d yyyy"),
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

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const isFiltered = Boolean(normalizedSearchTerm) || activeFilterCount > 0;
  const filteredTotal = filteredExpenses.reduce(
    (sum, expense) => sum + Number(expense.cost || 0),
    0,
  );

  if (expenses.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
        <p className="text-slate-700 font-medium">No expenses yet</p>
        <p className="text-slate-500 text-sm mt-1">
          Tap the + button to add your first one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Collapsible open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              type="search"
              enterKeyHint="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search expenses"
              aria-label="Search by category, notes, person, amount or date"
              className="pl-9 bg-card border-gray-200"
            />
          </div>

          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              className="relative shrink-0 gap-2 px-3 bg-card"
              aria-expanded={isFiltersOpen}
              aria-label={`Filters${activeFilterCount ? ` (${activeFilterCount} on)` : ""}`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-xs font-semibold text-white">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown
                className={`hidden sm:block w-4 h-4 transition-transform ${isFiltersOpen ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>

          {onAdd && (
            <Button
              className="hidden md:inline-flex shrink-0 gap-2 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:text-white dark:hover:bg-indigo-700"
              onClick={onAdd}
            >
              <Plus className="w-4 h-4" />
              Add
            </Button>
          )}
        </div>

        <div>
          <CollapsibleContent className="pt-4">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 rounded-xl border border-gray-100 bg-card p-3 sm:p-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Category
                </p>
                <Select
                  value={selectedCategory}
                  onValueChange={setSelectedCategory}
                >
                  <SelectTrigger className="bg-card">
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
                  <SelectTrigger className="bg-card">
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
                  className="bg-card"
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
                  className="bg-card"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Min Amount
                </p>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={minCost}
                  onChange={(event) => setMinCost(event.target.value)}
                  placeholder="0.00"
                  className="bg-card"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Max Amount
                </p>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={maxCost}
                  onChange={(event) => setMaxCost(event.target.value)}
                  placeholder="0.00"
                  className="bg-card"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Notes
                </p>
                <Select value={hasNotes} onValueChange={setHasNotes}>
                  <SelectTrigger className="bg-card">
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
                  <SelectTrigger className="bg-card">
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

      {/* Count and total for what's shown, so filtering doubles as a quick sum */}
      <div
        className="flex items-center justify-between gap-2 px-1 text-sm"
        aria-live="polite"
      >
        <span className="text-slate-500">
          {isFiltered
            ? `${filteredExpenses.length} of ${expenses.length}`
            : `${expenses.length} ${expenses.length === 1 ? "expense" : "expenses"}`}
          {isFiltered && (
            <button
              type="button"
              onClick={resetFilters}
              className="-my-2 ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-2 font-medium text-indigo-600 hover:text-indigo-700"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </span>
        {/* Without filters this would repeat the Spent card, so the total only shows when filtered */}
        {isFiltered && (
          <span className="font-semibold text-slate-900">
            Filtered {formatMoney(filteredTotal)}
          </span>
        )}
      </div>

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
        <div className="space-y-5">
          {groupByDay(filteredExpenses).map(({ date, items, total }) => (
            <section
              key={date || "no-date"}
              aria-label={formatDate(date, "EEEE, MMM d") || "No date"}
            >
              {/* Day header stays in view while scrolling through that day */}
              <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-10 -mx-4 mb-2 flex items-baseline justify-between bg-gray-50/95 px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur sm:mx-0 sm:px-1">
                <span>{date ? formatDate(date, "EEE, MMM d") : "No date"}</span>
                <span className="normal-case tracking-normal">
                  <span className="font-medium text-slate-400">
                    {items.length} {items.length === 1 ? "expense" : "expenses"} ·{" "}
                  </span>
                  {formatMoney(total)}
                </span>
              </div>
              <div className="space-y-2">
                {items.map((expense) => (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    colorKey={colors[expense.category]}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// Newest day first; each day's expenses keep the list's order
function groupByDay(expenses) {
  const groups = [];
  for (const expense of expenses) {
    const last = groups[groups.length - 1];
    if (last && last.date === expense.date) {
      last.items.push(expense);
      last.total += Number(expense.cost || 0);
    } else {
      groups.push({
        date: expense.date,
        items: [expense],
        total: Number(expense.cost || 0),
      });
    }
  }
  return groups;
}

function ExpenseRow({ expense, colorKey, onEdit, onDelete }) {
  const tone = categoryTone(expense.category, colorKey);
  const receipts = expense.receipt_urls?.length
    ? expense.receipt_urls
    : expense.receipt_url
      ? [expense.receipt_url]
      : [];

  return (
    // The whole card opens the expense (a full-size button underneath); the receipt link and the
    // Edit / Delete buttons sit above it and stay separately tappable.
    <div className="relative flex gap-3 rounded-xl border border-gray-100 bg-card p-3 shadow-sm transition-shadow hover:shadow-md sm:p-4">
      <button
        type="button"
        onClick={() => onEdit(expense)}
        aria-label={`Edit ${expense.category}, ${formatMoney(expense.cost)}`}
        className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 active:bg-gray-50"
      />
      <div
        aria-hidden
        className={`pointer-events-none relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase sm:h-12 sm:w-12 sm:text-sm ${tone.badge}`}
      >
        {expense.category?.slice(0, 2)}
      </div>

      <div className="pointer-events-none relative min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h4 className="truncate text-base font-semibold text-slate-900">
              {expense.category}
            </h4>
            {/* Saved on this device, not on the server yet */}
            {expense._pending && (
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  expense._error
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-800"
                }`}
                title={expense._error || "Will upload when you're online"}
              >
                {expense._error ? (
                  <AlertTriangle className="h-3 w-3" />
                ) : (
                  <CloudUpload className="h-3 w-3" />
                )}
                {expense._error ? "Sync failed" : "Waiting to sync"}
              </span>
            )}
          </div>
          <span className="shrink-0 whitespace-nowrap text-base font-bold text-slate-900">
            {formatMoney(expense.cost)}
          </span>
        </div>

        {/* Details on the left, Edit / Delete on the right */}
        <div className="mt-1 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
              {expense.assigned_to && (
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <User className="h-3 w-3" /> {expense.assigned_to}
                </span>
              )}
              {receipts.length > 0 && (
                <Dialog>
                  <DialogTrigger asChild>
                    <button className="pointer-events-auto relative -mx-1.5 -my-2 flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-2 text-indigo-600 transition-colors hover:text-indigo-700">
                      {receipts.length > 1 ? (
                        <Images className="h-3.5 w-3.5" />
                      ) : (
                        <ImageIcon className="h-3.5 w-3.5" />
                      )}
                      {receipts.length > 1
                        ? `${receipts.length} receipts`
                        : "Receipt"}
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl">
                    <DialogTitle>Receipts · {expense.category}</DialogTitle>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {receipts.map((url, idx) => (
                        <div
                          key={url}
                          className="overflow-hidden rounded-lg border border-gray-100 shadow-sm"
                        >
                          <ReceiptImage
                            url={url}
                            alt={`Receipt ${idx + 1}`}
                            className="h-auto min-h-24 w-full object-contain"
                          />
                        </div>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
              )}
          </div>
          <div className="pointer-events-auto relative -my-1.5 -mr-1.5 flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Edit ${expense.category} expense`}
              className="h-9 w-9 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
              onClick={() => onEdit(expense)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${expense.category} expense`}
              className="h-9 w-9 text-slate-400 hover:bg-red-50 hover:text-red-600"
              onClick={() => onDelete(expense.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {expense.notes && (
          <p
            className="mt-1.5 line-clamp-2 text-sm leading-snug text-slate-600"
            dir="auto"
          >
            {expense.notes}
          </p>
        )}
      </div>

    </div>
  );
}
