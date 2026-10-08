import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatMoney } from '@/lib/format';

const COLORS = ['#3B82F6', '#F59E0B', '#8B5CF6', '#10B981', '#EC4899', '#6366F1', '#9CA3AF'];

export default function ExpenseChart({ expenses }) {
  // Group by category
  const data = Object.values(expenses.reduce((acc, curr) => {
    const cat = curr.category || 'Other';
    if (!acc[cat]) {
      acc[cat] = { name: cat, value: 0 };
    }
    acc[cat].value += (curr.cost || 0);
    return acc;
  }, {})).sort((a, b) => b.value - a.value);

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-gray-400 text-sm">
        No expenses to display
      </div>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
            stroke="hsl(var(--card))"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value) => formatMoney(value)}
            // Theme colours, so the tooltip is readable in dark mode too
            contentStyle={{
              borderRadius: '12px',
              border: '1px solid hsl(var(--border))',
              background: 'hsl(var(--popover))',
              color: 'hsl(var(--popover-foreground))',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
            itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
          />
          <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}