import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/format";
import { categoryTone, categoryColorMap } from "@/lib/categoryColor";

// Building blocks shared by a trip's Analytics tab and the Analytics page

export function Panel({ title, subtitle, icon: Icon, action, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-gray-100 bg-card p-4 shadow-sm sm:p-5 ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-indigo-500" />}
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

const STAT_TONES = {
  default: "border-gray-100 bg-gray-50",
  indigo: "border-indigo-100 bg-indigo-50",
  green: "border-emerald-100 bg-emerald-50",
  amber: "border-amber-100 bg-amber-50",
  red: "border-red-100 bg-red-50",
};

export function Stat({ label, value, hint, tone = "default", className = "" }) {
  return (
    <div className={`min-w-0 rounded-xl border p-3 ${STAT_TONES[tone]} ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-lg font-bold leading-tight text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function EmptyNote({ children }) {
  return (
    <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-slate-500">
      {children}
    </p>
  );
}

// One line of a ranked list: name, amount, share and a bar showing that share
export function ShareRow({ lead, name, total, percent, count, barClass = "bg-indigo-500", muted = false }) {
  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        {lead}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`truncate text-sm font-medium ${muted ? "text-slate-500" : "text-slate-900"}`} dir="auto">
              {name}
            </span>
            <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-slate-900">
              {formatMoney(total)}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max(percent, 1)}%` }} />
            </div>
            <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-slate-500">
              {percent > 0 && percent < 1 ? "<1" : Math.round(percent)}% · {count} {count === 1 ? "expense" : "expenses"}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

// Categories as a list, in each category's colour (the same as in the expense list and pie)
export function CategoryList({ groups, categories = [] }) {
  const colors = categoryColorMap(categories);
  return (
    <ul className="divide-y divide-gray-100">
      {groups.map((group) => {
        const tone = categoryTone(group.name, colors[group.name]);
        return (
          <ShareRow
            key={group.name}
            lead={<span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />}
            barClass={tone.dot}
            {...group}
          />
        );
      })}
    </ul>
  );
}

const tooltipProps = {
  cursor: { fill: "hsl(var(--muted))", opacity: 0.6 },
  contentStyle: {
    borderRadius: "12px",
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--popover))",
    color: "hsl(var(--popover-foreground))",
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
    fontSize: 12,
  },
  itemStyle: { color: "hsl(var(--popover-foreground))" },
  labelStyle: { fontWeight: 600, marginBottom: 2 },
};

const axisTick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

// "12k", "1.5k", "800" for the chart's money axis
const shortMoney = (value) =>
  value >= 1000 ? `${Math.round((value / 1000) * 10) / 10}k` : `${Math.round(value)}`;

const INDIGO = "#6366f1";
const AMBER = "#f59e0b";

// Bars over time with an optional dashed line (e.g. the daily budget). Bars above the line turn amber.
export function SpendingBars({ data, xKey = "label", tooltipLabel, line, height = 220 }) {
  return (
    <div style={{ height }} className="-ml-2 w-[calc(100%+0.5rem)]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis
            dataKey={xKey}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={shortMoney}
          />
          <Tooltip
            {...tooltipProps}
            separator=": "
            formatter={(value) => [formatMoney(value), "Spent"]}
            labelFormatter={(label, payload) => (tooltipLabel && payload?.[0] ? tooltipLabel(payload[0].payload) : label)}
          />
          {line > 0 && (
            <ReferenceLine
              y={line}
              stroke={AMBER}
              strokeDasharray="5 4"
              strokeWidth={1.5}
              ifOverflow="extendDomain"
            />
          )}
          <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={36}>
            {data.map((entry, index) => (
              <Cell key={index} fill={line > 0 && entry.total > line ? AMBER : INDIGO} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
