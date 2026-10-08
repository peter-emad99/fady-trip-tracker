import React, { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { X, Upload, Camera, Calendar, User, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { uploadOrKeepLocal, deleteReceipt, organizeReceipts, isDriveReceipt } from '@/api/receiptStorage';
import { isLocalReceipt } from '@/lib/localReceipts';
import { isNetworkError } from '@/lib/network';
import { queueSave, hasPendingSave } from '@/lib/outbox';
import ReceiptImage from './ReceiptImage';
import { toast } from '@/components/ui/use-toast';
import { loadOpenCV } from '@/lib/docScanner';
import { format, subDays } from 'date-fns';
import { categoryTone } from '@/lib/categoryColor';
import { formatMoney, parseAmount } from '@/lib/format';
import ConfirmDialog from '@/components/ConfirmDialog';

const ReceiptReview = React.lazy(() => import('./ReceiptReview'));

const receiptActionClass =
  'flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 py-3 text-xs font-medium text-indigo-600 transition-colors hover:border-indigo-400 hover:bg-indigo-50 active:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

export default function ExpenseForm({ tripId, categories, expenseToEdit, people = [], onClose, onSuccess, onDelete }) {
  const { user } = useAuth();
  const { register, handleSubmit, setValue, watch, getValues, formState: { errors, isSubmitting, isDirty } } = useForm({
    defaultValues: {
      // Local date: toISOString() is UTC, which is still yesterday just after midnight in Egypt
      date: expenseToEdit?.date || format(new Date(), 'yyyy-MM-dd'),
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
      // Photos waiting for review: { files, index, source: 'camera' | 'upload', version }
      const [review, setReview] = React.useState(null);
      const [budgets, setBudgets] = React.useState([]);
      const [confirmDiscard, setConfirmDiscard] = React.useState(false);

      // Receipts only change in Drive when the expense is saved:
      // - uploadedHere: uploaded while this form was open; deleted if it's closed without saving
      // - removedSaved: already saved on the expense; deleted once the expense saves without them
      const initialUrls = React.useRef(getValues('receipt_urls') || []).current;
      const uploadedHere = React.useRef(new Set());
      const removedSaved = React.useRef([]);
      const saved = React.useRef(false);
      const closed = React.useRef(false);

      // Keep the page behind the sheet from scrolling along with it
      React.useEffect(() => {
        const { overflow } = document.body.style;
        document.body.style.overflow = 'hidden';
        return () => {
          document.body.style.overflow = overflow;
        };
      }, []);

      React.useEffect(() => {
        closed.current = false;
        return () => {
          closed.current = true;
          if (!saved.current) uploadedHere.current.forEach((url) => deleteQuietly(url));
        };
      }, []);

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
      // Offline, photos are kept on this device and uploaded when the expense syncs
      const results = await Promise.allSettled(files.map((file) => uploadOrKeepLocal(file, expenseId)));
      const newUrls = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      const failed = results.filter(r => r.status === 'rejected');

      // The form was closed while these were uploading, so nothing will ever reference them
      if (closed.current) {
        newUrls.forEach((url) => deleteQuietly(url));
        return;
      }
      newUrls.forEach((url) => uploadedHere.current.add(url));

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

      const openPicker = (source) => {
      // Start downloading the scanner now so it's (mostly) ready by the time a photo is picked
      loadOpenCV().catch(() => {});
      (source === 'camera' ? cameraInputRef : fileInputRef).current?.click();
      };

      // Every photo goes through the review screen (scan or keep the original) before uploading
      const handlePicked = (source) => (e) => {
      const files = Array.from(e.target.files || []);
      // Reset input so the same files can be picked again
      e.target.value = '';
      if (!files.length) return;
      setReview((prev) => prev
        // Retake / choose another: the new photo(s) replace the one being reviewed
        ? { ...prev, files: [...prev.files.slice(0, prev.index), ...files, ...prev.files.slice(prev.index + 1)], version: prev.version + 1 }
        : { files, index: 0, source, version: 0 });
      };

      const nextReview = () => {
      setReview((prev) => (prev && prev.index + 1 < prev.files.length
        ? { ...prev, index: prev.index + 1, version: prev.version + 1 }
        : null));
      };

      const handleReviewUse = (file) => {
      uploadFiles([file]);
      nextReview();
      };

      const handleUseAllOriginal = () => {
      uploadFiles(review.files.slice(review.index));
      setReview(null);
      };

      const removeReceipt = (indexToRemove) => {
      const currentUrls = getValues('receipt_urls') || [];
      const urlToRemove = currentUrls[indexToRemove];
      setValue('receipt_urls', currentUrls.filter((_, index) => index !== indexToRemove));
      if (!urlToRemove) return;

      if (uploadedHere.current.delete(urlToRemove)) {
        // Never saved anywhere, so it can go right away
        deleteQuietly(urlToRemove);
      } else {
        // Still on the saved expense: delete it only once the expense saves without it
        removedSaved.current.push(urlToRemove);
      }
      };

      const hasChanges = () =>
      isDirty ||
      pending.length > 0 ||
      !!review ||
      JSON.stringify(getValues('receipt_urls') || []) !== JSON.stringify(initialUrls);

      const requestClose = () => {
      if (isSubmitting) return;
      if (hasChanges()) setConfirmDiscard(true);
      else onClose();
      };

      // Escape closes the form, unless a menu, the photo review or the discard prompt is handling it
      const requestCloseRef = React.useRef(requestClose);
      requestCloseRef.current = requestClose;
      React.useEffect(() => {
        const onKeyDown = (e) => {
          if (e.key !== 'Escape' || e.defaultPrevented || review || confirmDiscard) return;
          if (document.querySelector('[data-radix-popper-content-wrapper]')) return;
          requestCloseRef.current();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
      }, [review, confirmDiscard]);

  const onSubmit = async (data) => {
    const cleanData = {
        ...data,
        cost: parseAmount(data.cost),
        receipt_url: data.receipt_urls?.[0] || null,
        user_id: user.id,
        trip_budget_id: data.trip_budget_id || null
    };

    // Kept on this device and sent later by the outbox (offline, or the connection dropped)
    const saveOffline = () => {
      queueSave({
        expense: { ...cleanData, id: expenseId, ...(!expenseToEdit && { created_at: new Date().toISOString() }) },
        isNew: !expenseToEdit,
        deleteUrls: removedSaved.current,
      });
      saved.current = true;
      toast({ title: 'Saved on this device', description: "It'll sync when you're back online." });
      onSuccess();
    };

    // Photos not uploaded yet, or an earlier offline change to this expense, mean it has to queue
    if (!navigator.onLine || cleanData.receipt_urls?.some(isLocalReceipt) || hasPendingSave(expenseId)) {
      saveOffline();
      return;
    }

    try {
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
      saved.current = true;
      // Not awaited: tidying Drive shouldn't delay closing the form
      removedSaved.current.forEach((url) => deleteQuietly(url));
      if (data.receipt_urls?.some(isDriveReceipt)) organizeReceipts({ expenseId });
      onSuccess();
    } catch (error) {
      if (isNetworkError(error)) {
        saveOffline();
        return;
      }
      console.error('Failed to save expense', error);
      toast({
        variant: 'destructive',
        title: "Couldn't save the expense",
        description: error.message || 'Check your connection and try again.',
      });
    }
  };

  const receiptUrls = watch('receipt_urls') || [];


  return (
    <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.5 }}
      exit={{ opacity: 0 }}
      onClick={requestClose}
      className="fixed inset-0 bg-black z-40"
    />
    <motion.div
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="expense-form-title"
      className="fixed inset-0 z-50 bg-card md:m-auto md:h-[80vh] md:w-[500px] md:rounded-2xl md:shadow-2xl flex flex-col"
    >
      <div className="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] md:pt-4 border-b border-gray-100">
        <h2 id="expense-form-title" className="text-lg font-bold">{expenseToEdit ? 'Edit Expense' : 'Add New Expense'}</h2>
        <Button variant="ghost" size="icon" onClick={requestClose} aria-label="Close" className="rounded-full hover:bg-gray-100">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-6">
        <form id="expense-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5 sm:space-y-6">
          
          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="expense-cost" className="text-xs font-medium text-slate-500 uppercase tracking-wider">Amount (EGP)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xl font-bold text-slate-300">EGP</span>
              {/* Text + decimal keypad: type="number" shows the wrong keyboard on iPhone and rejects "1,250" */}
              <Input
                id="expense-cost"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                aria-invalid={!!errors.cost}
                aria-describedby={errors.cost ? 'expense-cost-error' : undefined}
                className="pl-16 h-16 text-3xl font-bold border-gray-200 focus:border-indigo-500 focus:ring-indigo-500 rounded-xl"
                {...register('cost', {
                  validate: (value) => {
                    const amount = parseAmount(value);
                    if (String(value ?? '').trim() === '') return 'Enter an amount';
                    if (Number.isNaN(amount)) return 'Enter a number, like 150 or 99.50';
                    return amount > 0 || 'The amount must be more than 0';
                  },
                })}
                // Opening the keyboard straight away would cover the form on phones
                autoFocus={!expenseToEdit && window.matchMedia?.('(pointer: fine)').matches}
              />
            </div>
            {errors.cost && <p id="expense-cost-error" className="text-red-500 text-xs">{errors.cost.message}</p>}
          </div>

          {/* Category Selection */}
          <div className="space-y-2">
            <p id="expense-category-label" className="text-xs font-medium text-slate-500 uppercase tracking-wider">Category</p>
            <div role="radiogroup" aria-labelledby="expense-category-label" className="grid grid-cols-3 gap-2">
              {categories?.map((cat) => (
                <label
                  key={cat.id}
                  className={`
                    flex min-h-11 items-center gap-2 px-2.5 py-2 rounded-xl border cursor-pointer transition-all
                    has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-400
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
                  <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${categoryTone(cat.name, cat.color).dot}`} />
                  <span className="min-w-0 truncate text-xs font-medium">{cat.name}</span>
                </label>
              ))}
              {categories?.length === 0 && (
                <p className="col-span-full text-center text-xs text-slate-500 py-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  No categories yet. Add some from Categories on the trips page.
                </p>
              )}
            </div>
          </div>

          {/* Date & Budget */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-2">
              <div className="flex h-5 items-center justify-between gap-1">
                <Label htmlFor="expense-date" className="text-xs font-medium text-slate-500 uppercase tracking-wider">Date</Label>
                {/* One tap for the usual answers */}
                <div className="-my-2 flex">
                  {[['Today', 0], ['Yday', 1]].map(([label, daysAgo]) => {
                    const value = format(subDays(new Date(), daysAgo), 'yyyy-MM-dd');
                    const active = watch('date') === value;
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-label={daysAgo ? 'Yesterday' : 'Today'}
                        onClick={() => setValue('date', value, { shouldDirty: true })}
                        className={`rounded-md px-1.5 py-2 text-[11px] font-semibold ${active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input 
                  id="expense-date"
                  type="date" 
                  className="pl-9"
                  {...register('date', { required: true })} 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense-budget" className="flex h-5 items-center text-xs font-medium text-slate-500 uppercase tracking-wider">Sub-budget</Label>
              {/* Radix Select can't hold an empty value, so "none" stands in for no sub-budget */}
              <Select
                value={watch('trip_budget_id') || 'none'}
                onValueChange={(value) => setValue('trip_budget_id', value === 'none' ? '' : value, { shouldDirty: true })}
                disabled={!budgets.length && !watch('trip_budget_id')}
              >
                <SelectTrigger id="expense-budget">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{budgets.length ? 'None' : 'No sub-budgets yet'}</SelectItem>
                  {budgets.map((budget) => (
                    <SelectItem key={budget.id} value={budget.id}>
                      {budget.name} · {formatMoney(budget.amount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assigned To */}
          <div className="space-y-2">
            <Label htmlFor="expense-assigned" className="text-xs font-medium text-slate-500 uppercase tracking-wider">Assigned To</Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                id="expense-assigned"
                placeholder="Me" 
                className="pl-9"
                autoComplete="off"
                enterKeyHint="next"
                {...register('assigned_to')} 
              />
            </div>
            {/* Names already used on this trip, so there's less typing */}
            {people.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {people.slice(0, 6).map((name) => {
                  const active = watch('assigned_to') === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setValue('assigned_to', active ? '' : name, { shouldDirty: true })}
                      className={`h-9 rounded-full border px-3 text-xs font-medium transition-colors ${
                        active ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-slate-600 hover:bg-gray-50'
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="expense-notes" className="text-xs font-medium text-slate-500 uppercase tracking-wider">Notes</Label>
            <Textarea 
              id="expense-notes"
              placeholder="What was this for?" 
              className="resize-none"
              rows={2}
              dir="auto"
              {...register('notes')} 
            />
          </div>


          {/* Receipt Upload */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Receipts</p>
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
              onChange={handlePicked('upload')}
            />
            {/* capture opens the rear camera directly on phones; desktops ignore it */}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              ref={cameraInputRef}
              onChange={handlePicked('camera')}
            />
            {review && (
              <React.Suspense fallback={null}>
                <ReceiptReview
                  key={review.version}
                  file={review.files[review.index]}
                  index={review.index}
                  total={review.files.length}
                  source={review.source}
                  onUse={handleReviewUse}
                  onUseAllOriginal={handleUseAllOriginal}
                  onSkip={nextReview}
                  onRetake={() => openPicker(review.source)}
                  onCancel={() => setReview(null)}
                />
              </React.Suspense>
            )}

            {receiptUrls.length + pending.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {receiptUrls.map((url, index) => (
                  <div key={url} className="relative aspect-[3/4] rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                    <ReceiptImage
                      url={url}
                      alt={`Receipt ${index + 1}`}
                      link
                      linkClassName="block w-full h-full"
                      className="w-full h-full object-cover"
                    />
                    {isLocalReceipt(url) && (
                      <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        Not uploaded
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove receipt ${index + 1}`}
                      onClick={() => removeReceipt(index)}
                      className="absolute top-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-red-500"
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
                onClick={() => openPicker('camera')}
                className={`${receiptActionClass} hidden [@media(pointer:coarse)]:flex`}
              >
                <Camera className="w-5 h-5" />
                Camera
              </button>
              <button type="button" onClick={() => openPicker('upload')} className={`${receiptActionClass} flex`}>
                <Upload className="w-5 h-5" />
                Upload
              </button>
            </div>
          </div>
        </form>
      </div>

      <div className="flex gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-gray-100 bg-gray-50/50">
        {/* Asks for confirmation (in TripDetails); Undo is offered after */}
        {expenseToEdit && onDelete && (
          <Button
            type="button"
            variant="outline"
            aria-label="Delete expense"
            className="h-12 w-12 shrink-0 p-0 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            disabled={isSubmitting}
            onClick={() => onDelete(expenseToEdit)}
          >
            <Trash2 className="w-5 h-5" />
          </Button>
        )}
        <Button 
          type="submit" 
          form="expense-form" 
          className="flex-1 h-12 text-lg font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none"
          disabled={isSubmitting || uploading}
        >
          {isSubmitting ? 'Saving...' : uploading ? 'Uploading photo…' : expenseToEdit ? 'Save changes' : 'Save expense'}
        </Button>
      </div>
    </motion.div>

    <ConfirmDialog
      confirm={confirmDiscard && {
        title: 'Discard changes?',
        description: "Your changes and any receipts you added to this expense won't be saved.",
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        onConfirm: onClose,
      }}
      onClose={() => setConfirmDiscard(false)}
    />
    </>
  );
}

// Drive cleanup that the user doesn't need to wait for or hear about
function deleteQuietly(url) {
  deleteReceipt(url).catch((err) => console.error('Failed to delete receipt file:', err));
}