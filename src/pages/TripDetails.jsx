import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { 
  Plus, 
  ArrowLeft, 
  Wallet, 
  TrendingDown, 
  CreditCard, 
  Calendar,
  PieChart as PieChartIcon,
  List as ListIcon,
  Pencil,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AnimatePresence, motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import ExpenseForm from '../components/expenses/ExpenseForm';
import ExpenseList from '../components/expenses/ExpenseList';
import ExpenseChart from '../components/expenses/ExpenseChart';
import { exportTripToPDF } from '../components/trips/exportTrip';

export default function TripDetails() {
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get('id');
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const queryClient = useQueryClient();

  // Fetch Trip
  const { data: trip, isLoading: tripLoading } = useQuery({
    queryKey: ['trip', id],
    queryFn: async () => {
      const res = await base44.entities.Trip.list();
      return res.find(t => t.id === id);
    },
    enabled: !!id
  });

  // Fetch Expenses
  const { data: expenses, isLoading: expensesLoading } = useQuery({
    queryKey: ['expenses', id],
    queryFn: () => base44.entities.Expense.list(),
    select: (allExpenses) => allExpenses.filter(e => e.trip_id === id),
    enabled: !!id
  });

  // Fetch Categories
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list(),
    initialData: []
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (expenseId) => base44.entities.Expense.delete(expenseId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses', id] })
  });

  const updateTripMutation = useMutation({
    mutationFn: (data) => base44.entities.Trip.update(id, {
      ...data,
      received_amount: parseFloat(data.received_amount)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip', id] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      setIsEditOpen(false);
    }
  });

  const handleUpdateTrip = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    updateTripMutation.mutate(Object.fromEntries(formData));
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportTripToPDF(trip, expenses);
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setIsExporting(false);
    }
  };

  // Calculations
  const stats = useMemo(() => {
    if (!trip || !expenses) return { total: 0, remaining: 0, percent: 0 };
    const total = expenses.reduce((acc, curr) => acc + (curr.cost || 0), 0);
    const remaining = (trip.received_amount || 0) - total;
    const percent = Math.min(100, (total / (trip.received_amount || 1)) * 100);
    return { total, remaining, percent };
  }, [trip, expenses]);

  if (tripLoading || expensesLoading) return <div className="p-8 text-center animate-pulse">Loading trip details...</div>;
  if (!trip) return <div className="p-8 text-center text-red-500">Trip not found</div>;

  return (
    <div className="relative min-h-[calc(100vh-100px)]">
      
      {/* Header */}
      <div className="mb-6">
        <Link to="/" className="inline-flex items-center text-slate-500 hover:text-slate-900 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Trips
        </Link>
        
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{trip.name}</h1>
            <div className="flex items-center gap-2 text-slate-500 mt-1">
              <Calendar className="w-4 h-4" />
              <span className="text-sm">
                {trip.start_date ? format(new Date(trip.start_date), 'MMM d') : 'TBD'} 
                {trip.end_date && ` - ${format(new Date(trip.end_date), 'MMM d, yyyy')}`}
              </span>
            </div>
          </div>
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Pencil className="w-4 h-4" /> Edit
              </Button>
            </DialogTrigger>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 ml-2" 
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? <span className="animate-spin">⏳</span> : <Download className="w-4 h-4" />}
              Export
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Trip Details</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleUpdateTrip} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Trip Name</Label>
                  <Input id="name" name="name" defaultValue={trip.name} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Total Budget</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">EGP</span>
                    <Input id="amount" name="received_amount" type="number" step="0.01" className="pl-12" defaultValue={trip.received_amount} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start">Start Date</Label>
                    <Input id="start" name="start_date" type="date" defaultValue={trip.start_date} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end">End Date</Label>
                    <Input id="end" name="end_date" type="date" defaultValue={trip.end_date} />
                  </div>
                </div>
                <div className="pt-4 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                  <Button type="submit" className="bg-indigo-600" disabled={updateTripMutation.isPending}>
                    {updateTripMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
          <div className="flex items-center gap-2 mb-1 text-indigo-600">
            <Wallet className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Budget</span>
          </div>
          <p className="text-lg font-bold text-indigo-900">EGP {trip.received_amount?.toLocaleString()}</p>
        </div>

        <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
          <div className="flex items-center gap-2 mb-1 text-amber-600">
            <CreditCard className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Spent</span>
          </div>
          <p className="text-lg font-bold text-amber-900">EGP {stats.total.toLocaleString()}</p>
        </div>

        <div className={`${stats.remaining < 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'} p-4 rounded-2xl border`}>
          <div className={`flex items-center gap-2 mb-1 ${stats.remaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            <TrendingDown className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Left</span>
          </div>
          <p className={`text-lg font-bold ${stats.remaining < 0 ? 'text-red-900' : 'text-emerald-900'}`}>
            EGP {stats.remaining.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between text-xs mb-2 text-slate-500">
          <span>Budget Usage</span>
          <span>{stats.percent.toFixed(0)}%</span>
        </div>
        <Progress value={stats.percent} className={`h-3 ${stats.percent > 100 ? 'bg-red-100' : 'bg-gray-100'}`} indicatorClassName={stats.percent > 100 ? 'bg-red-500' : (stats.percent > 80 ? 'bg-amber-500' : 'bg-indigo-500')} />
      </div>

      {/* Content Tabs */}
      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="list" className="flex items-center gap-2">
            <ListIcon className="w-4 h-4" /> Expenses
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <PieChartIcon className="w-4 h-4" /> Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="pb-20">
          <ExpenseList 
            expenses={expenses || []} 
            onDelete={(id) => deleteExpenseMutation.mutate(id)}
            onEdit={(expense) => {
              setEditingExpense(expense);
              setShowExpenseForm(true);
            }}
          />
        </TabsContent>
        
        <TabsContent value="analytics" className="pb-20">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="text-lg font-bold mb-6 text-center">Spending Breakdown</h3>
            <ExpenseChart expenses={expenses || []} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Floating Action Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          setEditingExpense(null);
          setShowExpenseForm(true);
        }}
        className="fixed bottom-8 right-8 w-14 h-14 bg-slate-900 text-white rounded-full shadow-xl shadow-slate-300 flex items-center justify-center hover:bg-slate-800 transition-colors z-40"
      >
        <Plus className="w-6 h-6" />
      </motion.button>

      {/* Add/Edit Expense Modal */}
      <AnimatePresence>
        {showExpenseForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowExpenseForm(false)}
              className="fixed inset-0 bg-black z-40"
            />
            <ExpenseForm 
              tripId={id} 
              categories={categories} 
              expenseToEdit={editingExpense}
              onClose={() => setShowExpenseForm(false)}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['expenses', id] });
                queryClient.invalidateQueries({ queryKey: ['trips'] }); 
                setShowExpenseForm(false);
              }}
            />
          </>
        )}
      </AnimatePresence>

    </div>
  );
}