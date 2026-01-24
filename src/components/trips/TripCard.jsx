import React from 'react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { Calendar, ChevronRight, DollarSign, TrendingUp } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Progress } from '@/components/ui/progress';

export default function TripCard({ trip, expenses = [] }) {
  const totalSpent = expenses
    .filter(e => e.trip_id === trip.id)
    .reduce((acc, curr) => acc + (curr.cost || 0), 0);
  
  const remaining = (trip.received_amount || 0) - totalSpent;
  const percentUsed = Math.min(100, (totalSpent / (trip.received_amount || 1)) * 100);

  return (
    <Link to={createPageUrl(`TripDetails?id=${trip.id}`)}>
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 group">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-bold text-lg text-slate-900 group-hover:text-indigo-600 transition-colors">
              {trip.name}
            </h3>
            <div className="flex items-center gap-2 text-slate-500 text-sm mt-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {trip.start_date ? format(new Date(trip.start_date), 'MMM d') : 'TBD'} 
                {' - '}
                {trip.end_date ? format(new Date(trip.end_date), 'MMM d, yyyy') : 'TBD'}
              </span>
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${
            remaining < 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {remaining < 0 ? 'Over Budget' : 'On Track'}
          </div>
        </div>

        <div className="space-y-3 mt-4">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Spent</p>
              <p className="text-xl font-bold text-slate-900">EGP {totalSpent.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Budget</p>
              <p className="text-sm font-semibold text-slate-700">EGP {trip.received_amount?.toLocaleString()}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Progress value={percentUsed} className={`h-2 ${percentUsed > 100 ? 'bg-red-100' : 'bg-gray-100'}`} indicatorClassName={percentUsed > 100 ? 'bg-red-500' : (percentUsed > 80 ? 'bg-amber-500' : 'bg-indigo-500')} />
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">{percentUsed.toFixed(0)}% used</span>
              <span className={`font-medium ${remaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {remaining < 0 ? '-' : ''}EGP {Math.abs(remaining).toLocaleString()} remaining
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}