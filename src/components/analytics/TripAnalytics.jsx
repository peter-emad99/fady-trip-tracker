import { useMemo } from "react";
import { CalendarDays, Gauge, Receipt, Trophy, Users, PieChart as PieChartIcon } from "lucide-react";
import ExpenseChart from "@/components/expenses/ExpenseChart";
import { formatMoney, formatDate } from "@/lib/format";
import { categoryTone, categoryColorMap } from "@/lib/categoryColor";
import {
  byCategory,
  byPerson,
  dailySpending,
  receiptCoverage,
  sumCost,
  topExpenses,
  tripPace,
} from "@/lib/analytics";
import { CategoryList, EmptyNote, Panel, ShareRow, SpendingBars, Stat } from "./parts";

// The Analytics tab of a trip
export default function TripAnalytics({ trip, expenses, categories = [], onEdit }) {
  const pace = useMemo(() => tripPace(trip, expenses), [trip, expenses]);
  const days = useMemo(() => dailySpending(trip, expenses), [trip, expenses]);
  const categoryGroups = useMemo(() => byCategory(expenses), [expenses]);
  const people = useMemo(() => byPerson(expenses), [expenses]);
  const top = useMemo(() => topExpenses(expenses), [expenses]);
  const receipts = useMemo(() => receiptCoverage(expenses), [expenses]);
  const hasExpenses = expenses.length > 0;
  const daysWithSpending = days.filter((d) => d.total > 0).length;

  return (
    <div className="space-y-4">
      <PacePanel pace={pace} />

      {hasExpenses && days.length > 1 && (
        <Panel
          title="Spending per day"
          icon={CalendarDays}
          subtitle={`Average ${formatMoney(sumCost(expenses) / days.length)} a day · ${daysWithSpending} of ${days.length} days with spending`}
        >
          <SpendingBars
            data={days}
            line={pace.dailyBudget}
            tooltipLabel={(day) => formatDate(day.date, "EEE, MMM d")}
          />
          {pace.dailyBudget > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-3 border-t-2 border-dashed border-amber-500" /> Daily budget{" "}
                {formatMoney(pace.dailyBudget)}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-indigo-500" /> Within it
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-amber-500" /> Above it
              </span>
            </p>
          )}
        </Panel>
      )}

      {/* The original breakdown chart, now with the amounts listed under it */}
      <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-sm sm:p-6">
        <h3 className="mb-4 flex items-center justify-center gap-2 text-lg font-bold">
          <PieChartIcon className="h-4 w-4 text-indigo-500" /> Spending Breakdown
        </h3>
        <ExpenseChart expenses={expenses} categories={categories} />
        {hasExpenses && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <CategoryList groups={categoryGroups} categories={categories} />
          </div>
        )}
      </div>

      {hasExpenses && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Panel title="Who spent it" icon={Users} subtitle="From “Assigned to” on each expense">
            {people.some((p) => !p.unassigned) ? (
              <ul className="divide-y divide-gray-100">
                {people.map((person) => (
                  <ShareRow
                    key={person.name}
                    lead={<Initials name={person.name} muted={person.unassigned} />}
                    barClass={person.unassigned ? "bg-gray-300" : "bg-indigo-500"}
                    muted={person.unassigned}
                    {...person}
                  />
                ))}
              </ul>
            ) : (
              <EmptyNote>
                No one is assigned yet. Pick a person under “Assigned to” when adding an expense to see who spent what.
              </EmptyNote>
            )}
          </Panel>

          <Panel title="Receipts" icon={Receipt} subtitle="Expenses with a photo of the receipt">
            <ReceiptCoverage receipts={receipts} />
          </Panel>
        </div>
      )}

      {hasExpenses && (
        <Panel title="Biggest expenses" icon={Trophy} subtitle="Tap one to open it">
          <TopList expenses={top} categories={categories} onEdit={onEdit} />
        </Panel>
      )}
    </div>
  );
}

function PacePanel({ pace }) {
  if (pace.phase === "undated") {
    return (
      <Panel title="Pace" icon={Gauge}>
        <EmptyNote>Add the trip dates to see a daily budget and how fast the money is going.</EmptyNote>
      </Panel>
    );
  }

  const badge =
    pace.phase === "upcoming"
      ? `Starts in ${pace.startsIn} ${pace.startsIn === 1 ? "day" : "days"}`
      : pace.phase === "finished"
        ? `Ended · ${pace.totalDays} ${pace.totalDays === 1 ? "day" : "days"}`
        : pace.totalDays
          ? `Day ${pace.day} of ${pace.totalDays}`
          : `${pace.day} ${pace.day === 1 ? "day" : "days"} so far`;

  return (
    <Panel
      title="Pace"
      icon={Gauge}
      action={
        <span className="shrink-0 whitespace-nowrap rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
          {badge}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {pace.dailyBudget > 0 && (
          <Stat label="Daily budget" value={formatMoney(pace.dailyBudget)} hint={`${pace.totalDays} days`} />
        )}
        {pace.phase === "ongoing" && (
          <Stat
            label="Spending a day"
            value={formatMoney(pace.perDay)}
            hint={`over ${pace.day} ${pace.day === 1 ? "day" : "days"}`}
            tone={pace.dailyBudget && pace.perDay > pace.dailyBudget ? "amber" : "default"}
          />
        )}
        {pace.phase === "finished" && (
          <Stat
            label="Average a day"
            value={formatMoney(pace.perDay)}
            tone={pace.dailyBudget && pace.perDay > pace.dailyBudget ? "amber" : "default"}
          />
        )}
        {pace.phase === "ongoing" && pace.leftPerDay != null && (
          <Stat
            label="Left per day"
            value={formatMoney(pace.leftPerDay)}
            hint={pace.daysLeft === 1 ? "today, the last day" : `for the last ${pace.daysLeft} days`}
            tone={pace.leftPerDay > 0 ? "green" : "red"}
            className="col-span-2 sm:col-span-1"
          />
        )}
        {pace.phase === "upcoming" && (
          <Stat
            label="Spent before the trip"
            value={formatMoney(pace.spent)}
            hint={pace.budget ? `of ${formatMoney(pace.budget)}` : undefined}
          />
        )}
        {pace.phase === "ongoing" && !pace.totalDays && (
          <Stat label="Spent so far" value={formatMoney(pace.spent)} />
        )}
      </div>

      <PaceVerdict pace={pace} />
    </Panel>
  );
}

// One sentence on where the trip is heading
function PaceVerdict({ pace }) {
  const { budget, forecast, remaining } = pace;
  let tone = "green";
  let text = null;

  if (!budget) {
    if (pace.phase === "ongoing" && !pace.totalDays) text = "Add an end date to the trip to see a forecast.";
    tone = "neutral";
  } else if (pace.phase === "finished") {
    text =
      remaining >= 0
        ? `Finished ${formatMoney(remaining)} under budget.`
        : `Finished ${formatMoney(-remaining)} over budget.`;
    tone = remaining >= 0 ? "green" : "red";
  } else if (remaining < 0) {
    text = `The budget is already used up: ${formatMoney(-remaining)} over.`;
    tone = "red";
  } else if (pace.phase === "ongoing" && forecast != null) {
    if (forecast > budget) {
      text = `At this pace the trip will cost ${formatMoney(forecast)}, ${formatMoney(forecast - budget)} over budget. Keep to ${formatMoney(pace.leftPerDay)} a day to stay within it.`;
      tone = "amber";
    } else {
      text = `At this pace the trip will cost ${formatMoney(forecast)}, ${formatMoney(budget - forecast)} under budget.`;
    }
  } else if (pace.phase === "ongoing") {
    text = `${formatMoney(remaining)} left. Add an end date to the trip to see a forecast.`;
    tone = "neutral";
  } else if (pace.phase === "upcoming") {
    text = `${formatMoney(remaining)} of the budget is still free.`;
    tone = "neutral";
  }
  if (!text) return null;

  const tones = {
    green: "border-emerald-100 bg-emerald-50 text-emerald-800",
    amber: "border-amber-100 bg-amber-50 text-amber-800",
    red: "border-red-100 bg-red-50 text-red-700",
    neutral: "border-gray-100 bg-gray-50 text-slate-600",
  };
  return (
    <p className={`mt-3 rounded-xl border px-3 py-2.5 text-sm leading-snug ${tones[tone]}`}>
      {text}
    </p>
  );
}

function Initials({ name, muted }) {
  return (
    <span
      aria-hidden
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold uppercase ${
        muted ? "bg-gray-100 text-slate-400" : "bg-indigo-100 text-indigo-700"
      }`}
    >
      {muted ? "?" : name.slice(0, 2)}
    </span>
  );
}

function ReceiptCoverage({ receipts }) {
  const percent = Math.round(receipts.percent);
  const color = percent >= 80 ? "bg-emerald-500" : percent >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-slate-900">{percent}%</span>
        <span className="text-sm text-slate-500">
          {receipts.count} of {receipts.total} {receipts.total === 1 ? "expense" : "expenses"}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-3 text-sm text-slate-600">
        {receipts.countWithout === 0
          ? "Every expense has a receipt."
          : `${receipts.countWithout} without a receipt, worth ${formatMoney(receipts.amountWithout)}.`}
      </p>
    </div>
  );
}

function TopList({ expenses, categories, onEdit }) {
  const colors = categoryColorMap(categories);
  return (
    <ol className="-mx-2 space-y-1">
      {expenses.map((expense, index) => {
        const tone = categoryTone(expense.category, colors[expense.category]);
        const detail = [expense.notes, expense.assigned_to].filter(Boolean).join(" · ");
        return (
          <li key={expense.id}>
            <button
              type="button"
              onClick={() => onEdit?.(expense)}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 active:bg-gray-100"
            >
              <span className="w-4 shrink-0 text-center text-xs font-semibold text-slate-400">{index + 1}</span>
              <span
                aria-hidden
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold uppercase ${tone.badge}`}
              >
                {expense.category?.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{expense.category}</span>
                <span className="block truncate text-xs text-slate-500" dir="auto">
                  {formatDate(expense.date, "MMM d")}
                  {detail && ` · ${detail}`}
                </span>
              </span>
              <span className="shrink-0 whitespace-nowrap text-sm font-bold text-slate-900">
                {formatMoney(expense.cost)}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
