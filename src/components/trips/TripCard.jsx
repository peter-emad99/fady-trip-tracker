import { formatMoney, formatDate } from '@/lib/format';
import { Link } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Progress } from '@/components/ui/progress';

export default function TripCard({ trip, spent = 0 }) {
  const totalSpent = spent;

  const remaining = (trip.received_amount || 0) - totalSpent;
  // Not capped, so going over budget shows (e.g. 130%) and turns the bar red
  const percentUsed = (totalSpent / (trip.received_amount || 1)) * 100;
  const status =
    remaining < 0
      ? { label: 'Over budget', className: 'bg-red-100 text-red-700' }
      : percentUsed > 80
        ? { label: 'Nearly spent', className: 'bg-amber-100 text-amber-700' }
        : { label: 'On track', className: 'bg-emerald-100 text-emerald-700' };

  return (
    <Link
      to={createPageUrl(`TripDetails?id=${trip.id}`)}
      className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      <div className="bg-card rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 group">
        <div className="flex justify-between items-start gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="font-bold text-lg text-slate-900 group-hover:text-indigo-600 transition-colors break-words">
              {trip.name}
            </h3>
            <div className="flex items-center gap-2 text-slate-500 text-sm mt-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {trip.start_date ? formatDate(trip.start_date, 'MMM d') : 'TBD'}
                {' – '}
                {trip.end_date ? formatDate(trip.end_date) : 'TBD'}
              </span>
            </div>
          </div>
          <div className={`shrink-0 whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium ${status.className}`}>
            {status.label}
          </div>
        </div>

        <div className="space-y-3 mt-4">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Spent</p>
              <p className="text-xl font-bold text-slate-900">{formatMoney(totalSpent)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Budget</p>
              <p className="text-sm font-semibold text-slate-700">{formatMoney(trip.received_amount)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Progress value={Math.min(100, percentUsed)} className={`h-2 ${percentUsed > 100 ? 'bg-red-100' : 'bg-gray-100'}`} indicatorClassName={percentUsed > 100 ? 'bg-red-500' : (percentUsed > 80 ? 'bg-amber-500' : 'bg-indigo-500')} />
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">{percentUsed.toFixed(0)}% spent</span>
              <span className={`font-medium ${remaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {formatMoney(Math.abs(remaining))} {remaining < 0 ? 'over' : 'remaining'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}