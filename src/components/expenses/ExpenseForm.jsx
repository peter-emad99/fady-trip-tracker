import React, { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { X, Upload, Camera, ScanLine, Calendar, Tag, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { uploadReceipt, deleteReceipt, organizeReceipts, isDriveReceipt } from '@/api/receiptStorage';
import { toast } from '@/components/ui/use-toast';
import { loadOpenCV } from '@/lib/docScanner';

const ReceiptScanner = React.lazy(() => import('./ReceiptScanner'));

const receiptActionClass =
  'flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 py-3 text-xs font-medium text-indigo-600 transition-colors hover:border-indigo-400 hover:bg-indigo-50 active:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

export default function ExpenseForm({ tripId, categories, expenseToEdit, onClose, onSuccess }) {
  const { user } = useAuth();
  const { register, handleSubmit, setValue, watch, getValues, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      date: expenseToEdit?.date || new Date().toISOString().split('T')[0],
      trip_id: tripId,
      category: expenseToEdit?.category || categories[0]?.name || 'Other',
      trip_budget_id: expenseToEdit?.trip_budget_id || '',
      cost: expenseToEdit?.cost,
      assigned_to: expenseToEdit?.assigned_to || '',
      notes: expenseToEdit?.notes || '',
      receipt_urls: expenseToEdit?.receipt_urls || (expenseToEdit?.receipt_url ? [expenseToEdit.receipt_url] : [])
      }
      });

      const [pending, setPending] = React.useState([]); // receipts still uploading: { id, preview }
      const uploading = pending.length > 0;
      const fileInputRef = React.useRef(null);
      const cameraInputRef = React.useRef(null);
      const scanInputRef = React.useRef(null);
      const [scanFile, setScanFile] = React.useState(null);
      const [budgets, setBudgets] = React.useState([]);

      // Fetch trip budgets
      React.useEffect(() => {
        if (tripId) {
          supabase
            .from('trip_budgets')
            .select('*')
            .eq('trip_id', tripId)
            .then(({ data, error }) => {
              if (!error && data) setBudgets(data);
            });
        }
      }, [tripId]);
      
      // Generate a consistent ID for new expenses to allow file association before save
      const expenseId = useMemo(() => expenseToEdit?.id || crypto.randomUUID(), [expenseToEdit]);

      const uploadFiles = async (files) => {
      if (!files.length) return;

      // Show the local photos right away with a spinner while they upload
      const items = files.map((file) => ({ id: crypto.randomUUID(), preview: URL.createObjectURL(file) }));
      setPending((prev) => [...prev, ...items]);
      try {
      // allSettled so receipts that did upload are kept even if another one fails
      const results = await Promise.allSettled(files.map((file) => uploadReceipt(file, expenseId)));
      const newUrls = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      const failed = results.filter(r => r.status === 'rejected');

      const currentUrls = getValues('receipt_urls') || [];
      setValue('receipt_urls', [...currentUrls, ...newUrls]);

      if (failed.length) {
        console.error('Upload failed', failed.map(r => r.reason));
        toast({
          variant: 'destructive',
          title: `${failed.length} receipt${failed.length > 1 ? 's' : ''} failed to upload`,
          description: failed[0].reason?.message,
        });
      }
      } finally {
      items.forEach((item) => URL.revokeObjectURL(item.preview));
      setPending((prev) => prev.filter((item) => !items.includes(item)));
      }
      };

      const handleFileUpload = (e) => {
      uploadFiles(Array.from(e.target.files));
      // Reset input so same files can be selected again if needed
      e.target.value = '';
      };

      const handleScanClick = () => {
      // Start downloading OpenCV now so it's (mostly) ready by the time the photo is taken
      loadOpenCV().catch(() => {});
      scanInputRef.current?.click();
      };

      const handleScanPicked = (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) setScanFile(file);
      };

      const handleScanDone = (file) => {
      setScanFile(null);
      uploadFiles([file]);
      };

      const removeReceipt = async (indexToRemove) => {
      const currentUrls = getValues('receipt_urls') || [];
      const urlToRemove = currentUrls[indexToRemove];
      // Remove it from the form right away; the file is deleted in the background
      setValue('receipt_urls', currentUrls.filter((_, index) => index !== indexToRemove));

      if (urlToRemove) {
        try {
          await deleteReceipt(urlToRemove);
        } catch (err) {
          console.error('Error removing receipt:', err);
        }
      }
      };

  const onSubmit = async (data) => {
    try {
      const cleanData = {
          ...data,
          cost: parseFloat(data.cost),
          receipt_url: data.receipt_urls?.[0] || null,
          user_id: user.id,
          trip_budget_id: data.trip_budget_id || null
      };

      if (expenseToEdit) {
        const { error } = await supabase.from('expenses').update(cleanData).eq('id', expenseToEdit.id);
        if (error) throw error;
      } else {
        // Use the pre-generated ID for the new record
        const { error } = await supabase.from('expenses').insert({
          ...cleanData,
          id: expenseId
        });
        if (error) throw error;
      }
      // Not awaited: filing receipts into trip/expense folders shouldn't delay closing the form
      if (data.receipt_urls?.some(isDriveReceipt)) organizeReceipts({ expenseId });
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
      className="fixed inset-0 z-50 bg-white md:m-auto md:h-[80vh] md:w-[500px] md:rounded-2xl md:shadow-2xl flex flex-col"
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categories?.map((cat) => (
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
                  <Tag className="w-5 h-5 mb-1.5 opacity-70" />
                  <span className="text-xs font-medium text-center line-clamp-1">{cat.name}</span>
                </label>
              ))}
              {categories?.length === 0 && (
                <p className="col-span-full text-center text-xs text-slate-500 py-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  No categories found. Please add some in the Dashboard.
                </p>
              )}
            </div>
          </div>

          {/* Date & Budget */}
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
              <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Budget</Label>
              <Select
                value={watch('trip_budget_id')}
                onValueChange={(value) => setValue('trip_budget_id', value)}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select budget (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {budgets.map((budget) => (
                    <SelectItem key={budget.id} value={budget.id}>
                      {budget.name} - EGP {budget.amount?.toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assigned To */}
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
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Receipts</Label>
              {receiptUrls.length + pending.length > 0 && (
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
                  {receiptUrls.length + pending.length}
                </span>
              )}
            </div>

            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            {/* capture opens the rear camera directly on phones; desktops ignore it */}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              ref={cameraInputRef}
              onChange={handleFileUpload}
            />
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              ref={scanInputRef}
              onChange={handleScanPicked}
            />
            {scanFile && (
              <React.Suspense fallback={null}>
                <ReceiptScanner
                  file={scanFile}
                  onDone={handleScanDone}
                  onRetake={handleScanClick}
                  onCancel={() => setScanFile(null)}
                />
              </React.Suspense>
            )}

            {receiptUrls.length + pending.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {receiptUrls.map((url, index) => (
                  <div key={url} className="relative aspect-[3/4] rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                    <a href={url} target="_blank" rel="noreferrer" className="block w-full h-full">
                      <img src={url} alt={`Receipt ${index + 1}`} className="w-full h-full object-cover" />
                    </a>
                    <button
                      type="button"
                      aria-label={`Remove receipt ${index + 1}`}
                      onClick={() => removeReceipt(index)}
                      className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {pending.map((item) => (
                  <div key={item.id} className="relative aspect-[3/4] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                    <img src={item.preview} alt="" className="w-full h-full object-cover opacity-50" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Hidden buttons don't take a column, so the visible ones always share the full width */}
            <div className="grid grid-flow-col auto-cols-fr gap-2">
              {/* Only shown on touch devices, where a camera is likely */}
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className={`${receiptActionClass} hidden [@media(pointer:coarse)]:flex`}
              >
                <Camera className="w-5 h-5" />
                Camera
              </button>
              {/* Camera photo + edge crop + cleanup; on desktop it opens the file picker instead */}
              <button type="button" onClick={handleScanClick} className={`${receiptActionClass} flex`}>
                <ScanLine className="w-5 h-5" />
                Scan
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()} className={`${receiptActionClass} flex`}>
                <Upload className="w-5 h-5" />
                Upload
              </button>
            </div>
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