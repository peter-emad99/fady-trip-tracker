import { useSyncExternalStore } from 'react';
import { supabase } from '@/api/supabaseClient';
import { uploadReceipt, deleteReceipt, organizeReceipts, isDriveReceipt } from '@/api/receiptStorage';
import { isLocalReceipt, getLocalReceipt } from '@/lib/localReceipts';
import { isNetworkError } from '@/lib/network';
import { queryClientInstance } from '@/lib/query-client';
import { toast } from '@/components/ui/use-toast';

// Expense changes waiting to reach the server, kept in localStorage so they survive closing the app:
//   { id, kind: 'save', expense, isNew, deleteUrls, createdAt }   add/edit made offline
//   { id, kind: 'delete', expense, runAfter, createdAt }           delete (delayed so it can be undone)
// A failed op gets `error` and waits for Retry or Discard instead of blocking the rest.
const KEY = 'trippy.outbox';
const listeners = new Set();
let ops = load();

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

function commit(next) {
  ops = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(ops));
  } catch (err) {
    console.error('Could not save offline changes', err);
  }
  listeners.forEach((listener) => listener());
}

// Another tab changed the outbox
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY) return;
    ops = load();
    listeners.forEach((listener) => listener());
  });
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getOutbox = () => ops;
export const useOutbox = () => useSyncExternalStore(subscribe, getOutbox);
export const hasPendingSave = (expenseId) => ops.some((op) => op.kind === 'save' && op.expense.id === expenseId);

export function queueSave({ expense, isNew, deleteUrls = [] }) {
  const previous = ops.find((op) => op.kind === 'save' && op.expense.id === expense.id);
  const op = {
    id: previous?.id || crypto.randomUUID(),
    kind: 'save',
    // Still "new" if the earlier offline add never reached the server
    isNew: previous ? previous.isNew : isNew,
    expense: { ...previous?.expense, ...expense },
    deleteUrls: [...new Set([...(previous?.deleteUrls || []), ...deleteUrls])],
    createdAt: previous?.createdAt || Date.now(),
  };
  commit(previous ? ops.map((o) => (o === previous ? op : o)) : [...ops, op]);
  requestSync();
  return op.id;
}

export function queueDelete(expense, { delayMs = 0 } = {}) {
  const op = { id: crypto.randomUUID(), kind: 'delete', expense, runAfter: Date.now() + delayMs, createdAt: Date.now() };
  commit([...ops, op]);
  requestSync(delayMs);
  return op.id;
}

export function cancelOp(opId) {
  commit(ops.filter((op) => op.id !== opId));
}

export function dropTripOps(tripId) {
  commit(ops.filter((op) => op.expense.trip_id !== tripId));
}

export function retryFailed() {
  commit(ops.map(({ error: _error, ...op }) => op));
  return syncOutbox();
}

export async function discardFailed() {
  const failed = ops.filter((op) => op.error);
  commit(ops.filter((op) => !op.error));
  // Photos that were only ever on this device go with them
  for (const op of failed) {
    if (op.kind === 'save') await deleteLocalOnly(op.expense.receipt_urls);
  }
}

export function clearOutbox() {
  commit([]);
}

// Shows a list as it will be once everything syncs: offline adds/edits applied (marked _pending)
// and deleted expenses hidden. Pass a tripId to only apply that trip's changes.
export function applyOutbox(expenses, outbox, tripId) {
  if (!outbox.length) return expenses;
  const byId = new Map(expenses.map((e) => [e.id, e]));
  for (const op of outbox) {
    if (tripId && op.expense.trip_id !== tripId) continue;
    if (op.kind === 'delete') byId.delete(op.expense.id);
    else if (!outbox.some((o) => o.kind === 'delete' && o.expense.id === op.expense.id)) {
      byId.set(op.expense.id, { ...byId.get(op.expense.id), ...op.expense, _pending: true, _error: op.error });
    }
  }
  return [...byId.values()];
}

// ---- Syncing ----

let running = null;
let timer = null;

// Runs a sync now (or after `delayMs`). Safe to call often: only one sync runs at a time.
export function requestSync(delayMs = 0) {
  clearTimeout(timer);
  timer = setTimeout(() => syncOutbox(), delayMs + 50);
}

export function syncOutbox() {
  if (running) return running;
  if (!navigator.onLine || !ops.length) return Promise.resolve();
  // One tab at a time, so two open tabs don't upload the same photos twice
  const work = navigator.locks ? navigator.locks.request('trippy-outbox', runOnce) : runOnce();
  running = work.finally(() => {
    running = null;
    scheduleNext();
  });
  return running;
}

function scheduleNext() {
  const waiting = ops.filter((op) => !op.error && op.runAfter && op.runAfter > Date.now());
  if (waiting.length) requestSync(Math.min(...waiting.map((op) => op.runAfter)) - Date.now());
}

async function runOnce() {
  ops = load();
  let synced = 0;
  let changed = false;

  for (const op of [...ops]) {
    if (!navigator.onLine) break;
    if (!ops.includes(op) || op.error || (op.runAfter && op.runAfter > Date.now())) continue;

    try {
      if (op.kind === 'save') {
        const pendingDelete = ops.find((o) => o.kind === 'delete' && o.expense.id === op.expense.id);
        if (pendingDelete) {
          // Deleted before it ever synced: wait out the undo window, then drop it
          if (pendingDelete.runAfter > Date.now()) continue;
          await deleteLocalOnly(op.expense.receipt_urls);
          // Receipts this edit removed from the saved expense won't be covered by the delete
          for (const url of op.deleteUrls || []) await deleteReceipt(url).catch(() => {});
          commit(ops.filter((o) => o !== op && (!op.isNew || o !== pendingDelete)));
          changed = true;
          continue;
        }
        await runSave(op);
        synced += 1;
      } else {
        await runDelete(op);
      }
      commit(ops.filter((o) => o.id !== op.id));
      changed = true;
    } catch (err) {
      if (isNetworkError(err)) break;
      console.error('Offline change failed to sync', err);
      commit(ops.map((o) => (o.id === op.id ? { ...o, error: err.message || 'Unknown error' } : o)));
      changed = true;
      toast({
        variant: 'destructive',
        title: op.kind === 'save' ? "Couldn't sync an expense" : "Couldn't delete an expense",
        description: err.message,
      });
    }
  }

  if (changed) {
    queryClientInstance.invalidateQueries({ queryKey: ['expenses'] });
    queryClientInstance.invalidateQueries({ queryKey: ['tripBudgets'] });
    queryClientInstance.invalidateQueries({ queryKey: ['budgetExpenses'] });
  }
  if (synced) {
    toast({ title: `${synced} offline ${synced === 1 ? 'expense' : 'expenses'} synced` });
  }
}

const COLUMNS = ['id', 'trip_id', 'category', 'cost', 'date', 'assigned_to', 'notes', 'receipt_urls', 'receipt_url', 'user_id', 'trip_budget_id', 'created_at'];

async function runSave(op) {
  const expense = { ...op.expense };
  const urls = [...(expense.receipt_urls || [])];

  // Upload photos taken offline. Each new URL is saved straight away, so a retry never uploads twice.
  for (let i = 0; i < urls.length; i += 1) {
    if (!isLocalReceipt(urls[i])) continue;
    const item = await getLocalReceipt(urls[i]);
    if (!item) {
      urls.splice(i, 1);
      i -= 1;
      continue;
    }
    const uploaded = await uploadReceipt(new File([item.blob], item.name, { type: item.blob.type || 'image/jpeg' }), expense.id);
    const localUrl = urls[i];
    urls[i] = uploaded;
    expense.receipt_urls = [...urls];
    commit(ops.map((o) => (o.id === op.id ? { ...o, expense: { ...o.expense, receipt_urls: [...urls] } } : o)));
    await deleteReceipt(localUrl).catch(() => {});
  }

  expense.receipt_urls = urls;
  expense.receipt_url = urls[0] || null;
  const row = Object.fromEntries(COLUMNS.filter((c) => c in expense).map((c) => [c, expense[c]]));
  const { error } = await supabase.from('expenses').upsert(row);
  if (error) throw error;

  for (const url of op.deleteUrls || []) deleteReceipt(url).catch((err) => console.error('Failed to delete receipt file:', err));
  if (urls.some(isDriveReceipt)) organizeReceipts({ expenseId: expense.id });
}

async function runDelete(op) {
  const { error } = await supabase.from('expenses').delete().eq('id', op.expense.id);
  if (error) throw error;
  // The record is gone, so its files can go too (best effort)
  const { receipt_urls: list, receipt_url: single } = op.expense;
  for (const url of list?.length ? list : single ? [single] : []) {
    await deleteReceipt(url).catch((err) => console.error('Failed to delete receipt file:', err));
  }
}

async function deleteLocalOnly(urls = []) {
  for (const url of urls) if (isLocalReceipt(url)) await deleteReceipt(url).catch(() => {});
}
