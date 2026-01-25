import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Plus, Pencil, Trash2, X, Check, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function CategoryManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newName) => {
      const { data, error } = await supabase
        .from('categories')
        .insert([{ name: newName, user_id: user.id }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setName('');
      toast.success('Category created');
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, newName }) => {
      const { error } = await supabase
        .from('categories')
        .update({ name: newName })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setEditingId(null);
      toast.success('Category updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Category deleted');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate(name.trim());
  };

  const startEdit = (cat) => {
    setEditingId(cat.id);
    setName(cat.name);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full">
          <Settings2 className="w-4 h-4 mr-2" />
          Categories
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
          <Input 
            placeholder="New category name..." 
            value={editingId ? '' : name} 
            onChange={(e) => !editingId && setName(e.target.value)}
            disabled={!!editingId}
          />
          <Button type="submit" size="icon" disabled={createMutation.isPending || !!editingId}>
            <Plus className="w-4 h-4" />
          </Button>
        </form>

        <div className="mt-6 space-y-2 max-h-[300px] overflow-y-auto pr-2">
          {isLoading ? (
            <p className="text-center text-sm text-slate-500">Loading...</p>
          ) : (
            categories?.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between p-2 rounded-lg border border-gray-100 bg-gray-50/50">
                {editingId === cat.id ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <Input 
                      autoFocus
                      size="sm"
                      value={name} 
                      onChange={(e) => setName(e.target.value)}
                      className="h-8"
                    />
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8 text-green-600"
                      onClick={() => updateMutation.mutate({ id: cat.id, newName: name })}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8 text-slate-400"
                      onClick={() => { setEditingId(null); setName(''); }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm font-medium text-slate-700">{cat.name}</span>
                    <div className="flex items-center gap-1">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 text-slate-400 hover:text-indigo-600"
                        onClick={() => startEdit(cat)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 text-slate-400 hover:text-red-600"
                        onClick={() => {
                          if(confirm('Are you sure? Expenses with this category will remain, but the category itself will be gone.')) {
                            deleteMutation.mutate(cat.id);
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
          {!isLoading && categories?.length === 0 && (
            <p className="text-center py-4 text-sm text-slate-500">No custom categories yet.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
