import { format } from 'date-fns';
import { User, MoreHorizontal, Image as ImageIcon, Pencil, Images } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function ExpenseList({ expenses, onDelete, onEdit }) {
  if (expenses.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
        <p className="text-slate-500">No expenses recorded yet.</p>
      </div>
    );
  }

  // Sort by date desc, then created_date desc
  const sortedExpenses = [...expenses].sort((a, b) => {
    const dateDiff = new Date(b.date) - new Date(a.date);
    if (dateDiff !== 0) return dateDiff;
    return new Date(b.created_date || 0) - new Date(a.created_date || 0);
  });

  return (
    <div className="space-y-3">
      {sortedExpenses.map((expense) => (
        <div key={expense.id} className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center gap-4 flex-1 min-w-0 mr-2">
            <div className="h-12 w-12 shrink-0 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm uppercase">
              {expense.category?.slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-bold text-slate-900 text-base truncate">{expense.category}</h4>
              
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-600 mt-1">
                <span className="flex items-center gap-1 whitespace-nowrap">
                  {format(new Date(expense.date), 'MMM d')}
                </span>
                
                {expense.assigned_to && (
                  <>
                    <span className="text-slate-300 hidden sm:inline">|</span>
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <User className="w-3 h-3" /> {expense.assigned_to}
                    </span>
                  </>
                )}
                
                {(expense.receipt_urls?.length > 0 || expense.receipt_url) && (
                   <>
                     <span className="text-slate-300 hidden sm:inline">|</span>
                     <Dialog>
                       <DialogTrigger asChild>
                         <button className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 transition-colors whitespace-nowrap">
                           {expense.receipt_urls?.length > 1 ? <Images className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />} 
                           {expense.receipt_urls?.length > 1 ? `${expense.receipt_urls.length} Receipts` : 'Receipt'}
                         </button>
                       </DialogTrigger>
                       <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-white p-6 rounded-xl">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {(expense.receipt_urls?.length > 0 ? expense.receipt_urls : [expense.receipt_url]).map((url, idx) => (
                             <div key={idx} className="rounded-lg overflow-hidden border border-gray-100 shadow-sm">
                                 <img src={url} alt={`Receipt ${idx + 1}`} className="w-full h-auto object-contain" />
                             </div>
                           ))}
                         </div>
                       </DialogContent>
                     </Dialog>
                   </>
                )}
              </div>
              
              {expense.notes && (
                <p className="text-xs text-slate-600 mt-1.5 line-clamp-2 leading-relaxed">{expense.notes}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="font-bold text-slate-900 text-lg">
              -EGP {expense.cost?.toFixed(2)}
            </span>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(expense)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit Details
                </DropdownMenuItem>
                <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => onDelete(expense.id)}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
}