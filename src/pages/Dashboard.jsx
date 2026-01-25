import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { FolderPlus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import TripCard from '../components/trips/TripCard';

export default function Dashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: trips, isLoading: tripsLoading } = useQuery({
    queryKey: ['trips'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    initialData: []
  });

  const { data: expenses, isLoading: expensesLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select('*');
      if (error) throw error;
      return data;
    },
    // We load all expenses to calculate totals on dashboard. For scale, this should be done differently (e.g. separate aggregation entity or backend function), but fine for this scale.
    initialData: []
  });

  const createTripMutation = useMutation({
    mutationFn: async (data) => {
      const { data: newTrip, error } = await supabase.from('trips').insert({
        ...data,
        received_amount: parseFloat(data.received_amount),
        user_id: user.id
      }).select().single();
      
      if (error) throw error;
      return newTrip;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      setIsCreateOpen(false);
    }
  });

  const handleCreateTrip = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    createTripMutation.mutate(Object.fromEntries(formData));
  };

  const filteredTrips = trips.filter(trip => 
    trip.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">My Trips</h1>
          <p className="text-slate-500 mt-1">Manage your travel budgets and expenses</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 rounded-full px-6">
              <FolderPlus className="w-4 h-4 mr-2" />
              New Trip
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Trip</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateTrip} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Trip Name</Label>
                <Input id="name" name="name" placeholder="e.g. Summer in Italy" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Total Budget</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">EGP</span>
                  <Input id="amount" name="received_amount" type="number" step="0.01" className="pl-12" placeholder="2000.00" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start">Start Date</Label>
                  <Input id="start" name="start_date" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end">End Date</Label>
                  <Input id="end" name="end_date" type="date" />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-indigo-600" disabled={createTripMutation.isPending}>
                  {createTripMutation.isPending ? 'Creating...' : 'Create Trip'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input 
          placeholder="Search trips..." 
          className="pl-10 bg-white border-gray-200 focus:ring-indigo-500 rounded-xl"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Trip Grid */}
      {tripsLoading ? (
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {filteredTrips.map(trip => (
            <TripCard key={trip.id} trip={trip} expenses={expenses} />
          ))}
          {filteredTrips.length === 0 && (
            <div className="col-span-full text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FolderPlus className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900">No trips found</h3>
              <p className="text-slate-500">Create your first trip to get started!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}