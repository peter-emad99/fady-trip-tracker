import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Plus, Pencil, Trash2, X, Check, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import ConfirmDialog from '@/components/ConfirmDialog';
import { CATEGORY_COLORS, categoryTone, nextFreeColor } from '@/lib/categoryColor';

const showError = (title) => (error) => toast({ variant: 'destructive', title, description: error.message });

// Pass open/onOpenChange to open it from elsewhere (e.g. a menu); otherwise it shows its own button
export default function CategoryManager({ open, onOpenChange }) {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [ownOpen, setOwnOpen] = useState(false);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : ownOpen;
  const setIsOpen = controlled ? onOpenChange : setOwnOpen;
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [pickingId, setPickingId] = useState(null); // category whose colour palette is open

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
        .insert([{ name: newName, user_id: user.id, color: nextFreeColor(categories) }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setName('');
      toast({ title: 'Category created' });
    },
    onError: showError("Couldn't create the category"),
  });

  // Colour changes show straight away and roll back if saving fails
  const colorMutation = useMutation({
    mutationFn: async ({ id, color }) => {
      const { error } = await supabase.from('categories').update({ color }).eq('id', id);
      if (error) throw error;
    },
    onMutate: ({ id, color }) => {
      const previous = queryClient.getQueryData(['categories']);
      queryClient.setQueryData(['categories'], (old) => old?.map((c) => (c.id === id ? { ...c, color } : c)));
      return { previous };
    },
    onError: (error, _vars, context) => {
      queryClient.setQueryData(['categories'], context?.previous);
      showError("Couldn't change the colour")(error);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

  // Your own categories, plus the shared (system) ones for admins
  const canEdit = (cat) => (cat.user_id ? cat.user_id === user?.id : isAdmin === true);

  const updateMutation = useMutation({
    mutationFn: async ({ id, oldName, newName }) => {
      const { error } = await supabase
        .from('categories')
        .update({ name: newName })
        .eq('id', id);
      if (error) throw error;

      // Expenses store the category by name, so move the user's expenses over to the new name
      if (oldName !== newName) {
        const { error: expensesError } = await supabase
          .from('expenses')
          .update({ category: newName })
          .eq('category', oldName)
          .eq('user_id', user.id);
        if (expensesError) throw expensesError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      setEditingId(null);
      setName('');
      toast({ title: 'Category updated' });
    },
    onError: showError("Couldn't rename the category"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast({ title: 'Category deleted' });
    },
    onError: showError("Couldn't delete the category"),
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
      {!controlled && (
        <DialogTrigger asChild>
          <Button variant="outline" className="rounded-full">
            <Settings2 className="w-4 h-4 mr-2" />
            Categories
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
          <p className="text-sm text-slate-500">Tap a colour dot to choose that category's colour.</p>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
          <Input 
            aria-label="New category name"
            placeholder="New category name..." 
            value={editingId ? '' : name} 
            onChange={(e) => !editingId && setName(e.target.value)}
            disabled={!!editingId}
          />
          <Button type="submit" size="icon" aria-label="Add category" disabled={createMutation.isPending || !!editingId}>
            <Plus className="w-4 h-4" />
          </Button>
        </form>

        <div className="mt-2 space-y-2 sm:max-h-[300px] sm:overflow-y-auto sm:pr-2">
          {isLoading ? (
            <p className="text-center text-sm text-slate-500">Loading...</p>
          ) : (
            categories?.map((cat) => (
              <div key={cat.id} className="rounded-lg border border-gray-100 bg-gray-50/50">
              <div className="flex items-center justify-between p-2">
                {editingId === cat.id ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <Input 
                      autoFocus
                      aria-label="Category name"
                      value={name} 
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && name.trim()) {
                          e.preventDefault();
                          updateMutation.mutate({ id: cat.id, oldName: cat.name, newName: name.trim() });
                        }
                      }}
                    />
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      aria-label="Save name"
                      className="shrink-0 text-green-600"
                      disabled={!name.trim() || updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ id: cat.id, oldName: cat.name, newName: name.trim() })}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      aria-label="Cancel rename"
                      className="shrink-0 text-slate-400"
                      onClick={() => { setEditingId(null); setName(''); }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex min-w-0 items-center gap-1">
                      <button
                        type="button"
                        disabled={!canEdit(cat)}
                        aria-label={`Colour of ${cat.name}: ${categoryTone(cat.name, cat.color).label}${cat.color ? '' : ' (automatic)'}`}
                        aria-expanded={pickingId === cat.id}
                        onClick={() => setPickingId(pickingId === cat.id ? null : cat.id)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        <span className={`h-5 w-5 rounded-full ring-2 ring-white ${categoryTone(cat.name, cat.color).dot}`} />
                      </button>
                      <span className="truncate text-sm font-medium text-slate-700">{cat.name}</span>
                      {!cat.user_id && (
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">
                          System
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {cat.user_id === user?.id ? (
                        <>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            aria-label={`Rename ${cat.name}`}
                            className="text-slate-400 hover:text-indigo-600"
                            onClick={() => startEdit(cat)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            aria-label={`Delete ${cat.name}`}
                            className="text-slate-400 hover:text-red-600"
                            onClick={() =>
                              setConfirm({
                                title: `Delete "${cat.name}"?`,
                                description: 'Expenses in this category keep it, but you won\'t be able to pick it for new ones.',
                                confirmLabel: 'Delete category',
                                onConfirm: () => deleteMutation.mutate(cat.id),
                              })
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic mr-2">{cat.user_id ? 'Not yours' : 'Locked'}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
              {pickingId === cat.id && (
                <div className="border-t border-gray-100 p-2">
                  <div role="radiogroup" aria-label={`Colour for ${cat.name}`} className="grid grid-cols-6 gap-1.5">
                    {CATEGORY_COLORS.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        role="radio"
                        aria-checked={cat.color === c.key}
                        aria-label={c.label}
                        onClick={() => {
                          colorMutation.mutate({ id: cat.id, color: c.key });
                          setPickingId(null);
                        }}
                        className={`flex h-10 items-center justify-center rounded-lg hover:bg-gray-100 ${cat.color === c.key ? 'bg-gray-100' : ''}`}
                      >
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-white ${c.dot}`}>
                          {cat.color === c.key && <Check className="h-4 w-4" />}
                        </span>
                      </button>
                    ))}
                  </div>
                  {cat.color && (
                    <button
                      type="button"
                      onClick={() => {
                        colorMutation.mutate({ id: cat.id, color: null });
                        setPickingId(null);
                      }}
                      className="mt-1 h-9 w-full rounded-lg text-xs font-medium text-slate-500 hover:bg-gray-100"
                    >
                      Use automatic colour
                    </button>
                  )}
                </div>
              )}
              </div>
            ))
          )}
          {!isLoading && categories?.length === 0 && (
            <p className="text-center py-4 text-sm text-slate-500">No custom categories yet.</p>
          )}
        </div>
      </DialogContent>
      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </Dialog>
  );
}
