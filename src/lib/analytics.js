import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameMonth,
  isSameYear,
  startOfMonth,
  startOfToday,
  subMonths,
} from 'date-fns';
import { parseDate } from '@/lib/format';

// Numbers behind the Analytics tab of a trip and the Analytics page. Plain functions over the
// expense rows, so they also work on changes still waiting to sync.

const cost = (expense) => Number(expense.cost) || 0;
export const sumCost = (expenses) => expenses.reduce((sum, e) => sum + cost(e), 0);

const share = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

// Groups expenses by a name ("Food", "Fady"…): [{ name, total, count, percent }], biggest first
function groupBy(expenses, nameOf) {
  const groups = {};
  for (const expense of expenses) {
    const name = nameOf(expense);
    const group = (groups[name] ||= { name, total: 0, count: 0 });
    group.total += cost(expense);
    group.count += 1;
  }
  const total = sumCost(expenses);
  return Object.values(groups)
    .map((group) => ({ ...group, percent: share(group.total, total) }))
    .sort((a, b) => b.total - a.total);
}

export const byCategory = (expenses) => groupBy(expenses, (e) => e.category || 'Other');

// "Unassigned" is kept apart (unassigned: true) so it can be shown last and greyed out
export function byPerson(expenses) {
  const groups = groupBy(expenses, (e) => e.assigned_to?.trim() || '');
  return groups
    .map((group) => (group.name ? group : { ...group, name: 'Unassigned', unassigned: true }))
    .sort((a, b) => (a.unassigned ? 1 : 0) - (b.unassigned ? 1 : 0));
}

export const topExpenses = (expenses, count = 5) =>
  [...expenses].sort((a, b) => cost(b) - cost(a)).slice(0, count);

export const hasReceipt = (expense) => !!(expense.receipt_urls?.length || expense.receipt_url);

export function receiptCoverage(expenses) {
  const withReceipt = expenses.filter(hasReceipt);
  return {
    count: withReceipt.length,
    total: expenses.length,
    percent: share(withReceipt.length, expenses.length),
    amountWithout: sumCost(expenses) - sumCost(withReceipt),
    countWithout: expenses.length - withReceipt.length,
  };
}

// Where the trip is in time and how fast the money is going.
//   phase: 'upcoming' | 'ongoing' | 'finished' | 'undated' (no start date and no expenses)
//   dailyBudget: budget ÷ trip days (needs both dates)
//   day: days so far (trips without an end date: up to the last expense)
//   perDay: spent ÷ days so far
//   leftPerDay: what's left ÷ days left, today included (ongoing trips with an end date)
//   forecast: what the trip will cost at the current pace (ongoing trips with an end date)
export function tripPace(trip, expenses) {
  const today = startOfToday();
  const spent = sumCost(expenses);
  const budget = Number(trip?.received_amount) || 0;
  const dates = expenses.filter((e) => e.date).map((e) => parseDate(e.date));
  const firstExpense = dates.length ? new Date(Math.min(...dates)) : null;
  const start = trip?.start_date ? parseDate(trip.start_date) : firstExpense;
  const end = trip?.end_date ? parseDate(trip.end_date) : null;
  const base = { spent, budget, remaining: budget - spent };
  if (!start) return { ...base, phase: 'undated' };

  const totalDays = end ? Math.max(1, differenceInCalendarDays(end, start) + 1) : null;
  const dailyBudget = totalDays && budget ? budget / totalDays : null;

  if (differenceInCalendarDays(start, today) > 0) {
    return { ...base, phase: 'upcoming', totalDays, dailyBudget, startsIn: differenceInCalendarDays(start, today) };
  }
  if (end && differenceInCalendarDays(today, end) > 0) {
    return { ...base, phase: 'finished', totalDays, dailyBudget, perDay: spent / totalDays };
  }

  // Without an end date it isn't clear the trip is still going, so count up to the last expense
  // (or today, if the last expense is today or later)
  const lastExpense = dates.length ? new Date(Math.max(...dates)) : start;
  const upTo = end || lastExpense > today ? today : lastExpense;
  const day = Math.max(1, differenceInCalendarDays(upTo, start) + 1);
  const perDay = spent / day;
  const daysLeft = end ? differenceInCalendarDays(end, today) + 1 : null;
  return {
    ...base,
    phase: 'ongoing',
    day,
    totalDays,
    daysLeft,
    dailyBudget,
    perDay,
    leftPerDay: daysLeft ? Math.max(0, budget - spent) / daysLeft : null,
    forecast: totalDays ? perDay * totalDays : null,
  };
}

// Spending for every day of the trip (days with nothing spent count as 0), for the daily chart.
// Runs from the trip start (or first expense) to today or the trip end, and also covers any
// expense dated outside the trip. Long ranges keep the last `maxDays` days.
export function dailySpending(trip, expenses, maxDays = 92) {
  const totals = {};
  for (const expense of expenses) {
    if (expense.date) totals[expense.date] = (totals[expense.date] || 0) + cost(expense);
  }
  const keys = Object.keys(totals).sort();
  const today = startOfToday();
  const candidatesStart = [trip?.start_date, keys[0]].filter(Boolean).map(parseDate);
  if (!candidatesStart.length) return [];
  let from = new Date(Math.min(...candidatesStart));
  let until = trip?.end_date ? parseDate(trip.end_date) : today;
  if (until > today) until = today;
  if (keys.length) until = new Date(Math.max(until, parseDate(keys[keys.length - 1])));
  if (until < from) until = from;
  if (differenceInCalendarDays(until, from) >= maxDays) from = addDays(until, -(maxDays - 1));

  const days = [];
  for (let d = from; d <= until; d = addDays(d, 1)) {
    const key = format(d, 'yyyy-MM-dd');
    days.push({ date: key, label: format(d, 'MMM d'), total: totals[key] || 0 });
  }
  return days;
}

// Spending per month over the last `months` months (oldest first), for the trend chart
export function monthlySpending(expenses, months = 12) {
  const totals = {};
  for (const expense of expenses) {
    if (expense.date) {
      const key = expense.date.slice(0, 7);
      totals[key] = (totals[key] || 0) + cost(expense);
    }
  }
  const thisMonth = startOfMonth(new Date());
  return Array.from({ length: months }, (_, i) => {
    const month = subMonths(thisMonth, months - 1 - i);
    const key = format(month, 'yyyy-MM');
    return { month: key, label: format(month, 'MMM'), fullLabel: format(month, 'MMMM yyyy'), total: totals[key] || 0 };
  });
}

// Headline numbers across every trip
export function overallTotals(trips, expenses) {
  const now = new Date();
  const dated = expenses.filter((e) => e.date);
  const thisMonth = sumCost(dated.filter((e) => isSameMonth(parseDate(e.date), now)));
  const thisYear = sumCost(dated.filter((e) => isSameYear(parseDate(e.date), now)));
  const total = sumCost(expenses);

  // Average per trip: over trips that have any spending
  const spentTrips = new Set(expenses.map((e) => e.trip_id));
  // Average per day: total spent ÷ trip days so far (see tripPace for how days are counted)
  let days = 0;
  let spentOnDatedTrips = 0;
  const byTrip = spentByTrip(expenses);
  for (const trip of trips) {
    const tripExpenses = expenses.filter((e) => e.trip_id === trip.id);
    const pace = tripPace(trip, tripExpenses);
    const tripDays = pace.phase === 'finished' ? pace.totalDays : pace.phase === 'ongoing' ? pace.day : 0;
    if (tripDays) {
      days += tripDays;
      spentOnDatedTrips += byTrip[trip.id] || 0;
    }
  }
  return {
    total,
    thisMonth,
    thisYear,
    perTrip: spentTrips.size ? total / spentTrips.size : 0,
    tripsCounted: spentTrips.size,
    perDay: days ? spentOnDatedTrips / days : 0,
    daysCounted: days,
  };
}

export function spentByTrip(expenses) {
  const totals = {};
  for (const expense of expenses) totals[expense.trip_id] = (totals[expense.trip_id] || 0) + cost(expense);
  return totals;
}

// Same thresholds as the badges on the trips list
export function budgetStatus(spent, budget) {
  const percent = share(spent, budget || 0);
  if (budget > 0 && spent > budget) return { key: 'over', label: 'Over budget', percent };
  if (percent > 80) return { key: 'nearly', label: 'Nearly spent', percent };
  return { key: 'ok', label: 'On track', percent };
}
