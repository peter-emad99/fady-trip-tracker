import { lazy, Suspense, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { BarChart3, ChevronRight, CloudOff, PieChart as PieChartIcon, TrendingUp, Wallet } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { useOutbox, applyOutbox } from "@/lib/outbox";
import { formatMoney, formatDate } from "@/lib/format";
import { createPageUrl } from "@/utils";
import { budgetStatus, byCategory, monthlySpending, overallTotals, spentByTrip } from "@/lib/analytics";
import { CategoryList, EmptyNote, Panel, SpendingBars, Stat } from "@/components/analytics/parts";

const ExpenseChart = lazy(() => import("@/components/expenses/ExpenseChart"));

// Analytics across every trip. The trips list stays the main page; this one is in the top bar.
export default function Analytics() {
  const outbox = useOutbox();

  const {
    data: trips = [],
    isLoading: tripsLoading,
    isError: tripsError,
    refetch,
    fetchStatus,
  } = useQuery({
    queryKey: ["trips"],
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: serverExpenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ["expenses", "analytics"],
    queryFn: async () => {
      // Only the columns the numbers need
      const { data, error } = await supabase
        .from("expenses")
        .select("id, trip_id, cost, date, category, created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Includes changes waiting to sync; expenses of deleted trips are left out
  const expenses = useMemo(() => {
    const tripIds = new Set(trips.map((t) => t.id));
    return applyOutbox(serverExpenses, outbox).filter((e) => tripIds.has(e.trip_id));
  }, [serverExpenses, outbox, trips]);

  const totals = useMemo(() => overallTotals(trips, expenses), [trips, expenses]);
  const months = useMemo(() => monthlySpending(expenses), [expenses]);
  const categoryGroups = useMemo(() => byCategory(expenses), [expenses]);
  const tripRows = useMemo(() => {
    const spent = spentByTrip(expenses);
    return trips
      .map((trip) => ({ trip, spent: spent[trip.id] || 0, budget: Number(trip.received_amount) || 0 }))
      .sort((a, b) => (b.trip.start_date || b.trip.created_at || "").localeCompare(a.trip.start_date || a.trip.created_at || ""));
  }, [trips, expenses]);

  const busiest = months.reduce((best, m) => (m.total > (best?.total || 0) ? m : best), null);
  const now = new Date();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Analytics</h1>
        <p className="mt-1 text-sm text-slate-500 sm:text-base">All your trips together</p>
      </header>

      {tripsLoading || expensesLoading ? (
        <div className="space-y-4" role="status" aria-label="Loading analytics">
          <div className="h-24 animate-pulse rounded-2xl bg-gray-100" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      ) : fetchStatus === "paused" && !trips.length ? (
        <div className="py-12 text-center">
          <CloudOff className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <h3 className="text-lg font-medium text-slate-900">You're offline</h3>
          <p className="text-slate-500">Analytics will appear once you're back online.</p>
        </div>
      ) : tripsError && !trips.length ? (
        <div className="py-12 text-center">
          <h3 className="text-lg font-medium text-slate-900">Couldn't load your trips</h3>
          <p className="mb-4 text-slate-500">Check your connection and try again.</p>
          <Button variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : !expenses.length ? (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <BarChart3 className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900">Nothing to show yet</h3>
          <p className="text-slate-500">Add expenses to a trip and your totals and trends will appear here.</p>
        </div>
      ) : (
        <>
          {/* Headline numbers */}
          <section className="space-y-3">
            <div className="rounded-2xl bg-indigo-600 p-4 text-white shadow-sm sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-100">Total spent</p>
              <p className="mt-1 text-3xl font-bold">{formatMoney(totals.total)}</p>
              <p className="mt-1 text-sm text-indigo-100">
                across {trips.length} {trips.length === 1 ? "trip" : "trips"} · {expenses.length}{" "}
                {expenses.length === 1 ? "expense" : "expenses"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="This month" value={formatMoney(totals.thisMonth)} hint={format(now, "MMMM")} />
              <Stat label="This year" value={formatMoney(totals.thisYear)} hint={format(now, "yyyy")} />
              <Stat
                label="Per trip"
                value={formatMoney(totals.perTrip)}
                hint={`average of ${totals.tripsCounted} ${totals.tripsCounted === 1 ? "trip" : "trips"}`}
              />
              <Stat
                label="Per day"
                value={totals.daysCounted ? formatMoney(totals.perDay) : "—"}
                hint={
                  totals.daysCounted
                    ? `average over ${totals.daysCounted} trip ${totals.daysCounted === 1 ? "day" : "days"}`
                    : "needs trip dates"
                }
              />
            </div>
          </section>

          <Panel
            title="Monthly trend"
            icon={TrendingUp}
            subtitle={
              busiest ? `Last 12 months · busiest: ${busiest.fullLabel} (${formatMoney(busiest.total)})` : "Last 12 months"
            }
          >
            <SpendingBars data={months} tooltipLabel={(m) => m.fullLabel} />
          </Panel>

          <Panel title="Budget vs spent" icon={Wallet} subtitle="Each trip's budget next to what's been spent">
            <TripComparison rows={tripRows} />
          </Panel>

          <Panel title="Categories" icon={PieChartIcon} subtitle="All trips together">
            <Suspense fallback={<div className="h-72 animate-pulse rounded-2xl bg-gray-50" />}>
              <ExpenseChart expenses={expenses} categories={categories} />
            </Suspense>
            <div className="mt-4 border-t border-gray-100 pt-4">
              <CategoryList groups={categoryGroups} categories={categories} />
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

const STATUS_STYLES = {
  ok: { bar: "bg-indigo-500", chip: "bg-green-100 text-green-700" },
  nearly: { bar: "bg-amber-500", chip: "bg-amber-100 text-amber-700" },
  over: { bar: "bg-red-500", chip: "bg-red-100 text-red-700" },
};

// Budget and spent as two bars per trip, on that trip's own scale (the larger of the two fills the row)
function TripComparison({ rows }) {
  if (!rows.length) return <EmptyNote>No trips yet.</EmptyNote>;
  return (
    <ul className="-mx-2 space-y-1">
      {rows.map(({ trip, spent, budget }) => {
        const status = budgetStatus(spent, budget);
        const style = STATUS_STYLES[status.key];
        const max = Math.max(1, budget, spent);
        return (
          <li key={trip.id}>
            <Link
              to={createPageUrl(`TripDetails?id=${trip.id}`)}
              className="block rounded-xl px-2 py-2.5 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 active:bg-gray-100"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-left text-sm font-semibold text-slate-900" dir="auto">
                    {trip.name}
                  </p>
                  {trip.start_date && (
                    <p className="text-xs text-slate-500">
                      {formatDate(trip.start_date, "MMM d, yyyy")}
                      {trip.end_date && ` – ${formatDate(trip.end_date, "MMM d")}`}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {budget > 0 && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${style.chip}`}>
                      {Math.round(status.percent)}%
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-[3.25rem_1fr_auto] items-center gap-x-2 gap-y-1.5 text-xs">
                <span className="text-slate-500">Budget</span>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-gray-300" style={{ width: `${(budget / max) * 100}%` }} />
                </div>
                <span className="text-right tabular-nums text-slate-600">{formatMoney(budget)}</span>
                <span className="text-slate-500">Spent</span>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${style.bar}`}
                    style={{ width: `${Math.max(spent ? 1 : 0, (spent / max) * 100)}%` }}
                  />
                </div>
                <span className="text-right font-semibold tabular-nums text-slate-900">{formatMoney(spent)}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
