import React from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { X, Calendar, Tag, User, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/api/supabaseClient';

export default function ExpenseForm({ tripId, categories, expenseToEdit, onClose, onSuccess }) {
  const { register, handleSubmit, setValue, watch, getValues, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      date: expenseToEdit?.date || new Date().toISOString().split('T')[0],
      trip_id: tripId,
      category: expenseToEdit?.category || categories[0]?.name || 'Other',
      cost: expenseToEdit?.cost,
      assigned_to: expenseToEdit?.assigned_to || '',
      notes: expenseToEdit?.notes || '',
      receipt_urls: expenseToEdit?.receipt_urls || (expenseToEdit?.receipt_url ? [expenseToEdit.receipt_url] : [])
      }
      });

      const [uploading, setUploading] = React.useState(false);
      const fileInputRef = React.useRef(null);

      const handleFileUpload = async (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;

      setUploading(true);
      try {
      const uploadPromises = files.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('receipts').getPublicUrl(filePath);
        return { file_url: data.publicUrl };
      });

      const results = await Promise.all(uploadPromises);
      const newUrls = results.map(r => r.file_url);

      const currentUrls = getValues('receipt_urls') || [];
      setValue('receipt_urls', [...currentUrls, ...newUrls]);
      } catch (error) {
      console.error('Upload failed', error);
      } finally {
      setUploading(false);
      // Reset input so same files can be selected again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
      }
      };

      const removeReceipt = (indexToRemove) => {
      const currentUrls = getValues('receipt_urls') || [];
      setValue('receipt_urls', currentUrls.filter((_, index) => index !== indexToRemove));
      };

  const onSubmit = async (data) => {
    try {
      const cleanData = {
          ...data,
          cost: parseFloat(data.cost),
          // Ensure backward compatibility or cleanup
          receipt_url: data.receipt_urls?.[0] || null 
      };

      if (expenseToEdit) {
        const { error } = await supabase.from('expenses').update(cleanData).eq('id', expenseToEdit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('expenses').insert(cleanData);
        if (error) throw error;
      }
      onSuccess();
    } catch (error) {
      console.error('Failed to save expense', error);
    }
  };

  const receiptUrls = watch('receipt_urls') || [];


  return (
    <motion.div
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed inset-0 z-50 bg-white md:inset-x-auto md:left-1/2 md:top-[10%] md:bottom-[10%] md:w-[500px] md:-translate-x-1/2 md:rounded-2xl md:shadow-2xl flex flex-col"
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h2 className="text-lg font-bold">{expenseToEdit ? 'Edit Expense' : 'Add New Expense'}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-gray-100">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <form id="expense-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          
          {/* Amount Input */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Amount (EGP)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xl font-bold text-slate-300">EGP</span>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                className="pl-16 h-16 text-3xl font-bold border-gray-200 focus:border-indigo-500 focus:ring-indigo-500 rounded-xl"
                {...register('cost', { required: true, min: 0.01 })}
                autoFocus
              />
            </div>
            {errors.cost && <p className="text-red-500 text-xs">Amount is required</p>}
          </div>

          {/* Category Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Category</Label>
            <div className="grid grid-cols-3 gap-2">
              {categories.map((cat) => (
                <label
                  key={cat.id}
                  className={`
                    flex flex-col items-center justify-center p-3 rounded-xl border cursor-pointer transition-all
                    ${watch('category') === cat.name 
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                      : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50 text-slate-600'}
                  `}
                >
                  <input
                    type="radio"
                    value={cat.name}
                    className="sr-only"
                    {...register('category')}
                  />
                  {/* Ideally we would map icon name to component here, simplified for now */}
                  <Tag className="w-5 h-5 mb-1.5 opacity-70" />
                  <span className="text-xs font-medium">{cat.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Date & Assignee */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input 
                  type="date" 
                  className="pl-9"
                  {...register('date', { required: true })} 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Assigned To</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input 
                  placeholder="Me" 
                  className="pl-9"
                  {...register('assigned_to')} 
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Notes</Label>
            <Textarea 
              placeholder="What was this for?" 
              className="resize-none"
              rows={3}
              {...register('notes')} 
            />
          </div>

          {/* Receipt Upload */}
          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Receipts ({receiptUrls.length})</Label>
            </div>

            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />

            <div className="grid grid-cols-3 gap-3">
              {receiptUrls.map((url, index) => (
                  <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-50 group">
                      <img src={url} alt={`Receipt ${index + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                      <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute top-1 right-1 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeReceipt(index)}
                      >
                          <X className="w-3 h-3" />
                      </Button>
                  </div>
              ))}

              <Button
                  type="button"
                  variant="outline"
                  className="aspect-square flex flex-col gap-1 border-dashed border-2 hover:border-indigo-400 hover:bg-indigo-50"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
              >
                  {uploading ? (
                      <span className="animate-spin">⏳</span>
                  ) : (
                      <>
                          <Plus className="w-6 h-6 text-indigo-500" />
                          <span className="text-[10px] text-indigo-600 font-medium">Add</span>
                      </>
                  )}
              </Button>
            </div>
            {uploading && <p className="text-xs text-indigo-500 animate-pulse">Uploading receipts...</p>}
          </div>

        </form>
      </div>

      <div className="p-4 border-t border-gray-100 bg-gray-50/50">
        <Button 
          type="submit" 
          form="expense-form" 
          className="w-full h-12 text-lg font-semibold bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200"
          disabled={isSubmitting || uploading}
        >
          {isSubmitting ? 'Saving...' : 'Save Expense'}
        </Button>
      </div>
    </motion.div>
  );
}