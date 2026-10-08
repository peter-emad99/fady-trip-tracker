import { supabase } from '@/api/supabaseClient';
import { csvCell } from '@/lib/csv';

const SUPABASE_RECEIPTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/receipts/`;
const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic' };
const CONCURRENCY = 4;

function cleanName(value) {
  return String(value ?? '').replace(/[\r\n\t/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Untitled';
}

function receiptUrls(expense) {
  const urls = Array.isArray(expense.receipt_urls) && expense.receipt_urls.length
    ? expense.receipt_urls
    : expense.receipt_url ? [expense.receipt_url] : [];
  return urls.filter(Boolean);
}

function supabaseFileName(url) {
  const parts = url.split('/receipts/');
  return parts.length > 1 && !url.startsWith('/api/') ? decodeURIComponent(parts[1].split('?')[0]) : null;
}

// Builds a .zip of every receipt (Google Drive and Supabase Storage), organized as
// "<trip>/<date - category - cost>/Receipt N.ext", plus Supabase files no expense uses and an
// expenses.csv index. Nothing is changed or deleted. Returns { files, missing }.
export async function downloadReceiptBackup(onProgress) {
  const { data, error } = await supabase.rpc('get_receipt_backup_index');
  if (error) throw error;

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  const tasks = []; // { url, path } where path has no extension yet
  const rows = [];
  const linkedSupabaseFiles = new Set();

  for (const expense of data.expenses) {
    const cost = Number(expense.cost || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
    const folder = `${cleanName(expense.trip_name || 'No trip')}/${cleanName(
      `${expense.date || 'No date'} - ${expense.category || 'Other'} - ${cost} EGP (${String(expense.id).slice(0, 8)})`,
    )}`;
    const urls = receiptUrls(expense);

    urls.forEach((url, i) => {
      const name = supabaseFileName(url);
      if (name) linkedSupabaseFiles.add(name);
      const task = { url, path: `${folder}/Receipt ${i + 1}`, row: null };
      task.row = {
        trip: expense.trip_name, date: expense.date, category: expense.category, cost: expense.cost,
        assigned_to: expense.assigned_to, notes: expense.notes, expense_id: expense.id,
        source: name ? 'Supabase' : 'Google Drive', original_url: url, file: '', status: '',
      };
      tasks.push(task);
      rows.push(task.row);
    });

    if (!urls.length) {
      rows.push({
        trip: expense.trip_name, date: expense.date, category: expense.category, cost: expense.cost,
        assigned_to: expense.assigned_to, notes: expense.notes, expense_id: expense.id,
        source: '', original_url: '', file: '', status: 'no receipt',
      });
    }
  }

  // Files left in Supabase that no expense points to (e.g. from cancelled forms) — kept just in case
  for (const name of data.supabase_files) {
    if (linkedSupabaseFiles.has(name)) continue;
    const row = { source: 'Supabase (not linked to an expense)', original_url: SUPABASE_RECEIPTS_URL + name, file: '', status: '' };
    tasks.push({ url: SUPABASE_RECEIPTS_URL + encodeURIComponent(name), path: `Unlinked Supabase files/${cleanName(name)}`, keepName: true, row });
    rows.push(row);
  }

  let done = 0;
  const missing = [];
  onProgress?.({ done, total: tasks.length });

  const queue = [...tasks];
  const worker = async () => {
    while (queue.length) {
      const task = queue.shift();
      try {
        const res = await fetch(task.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const ext = EXT_BY_MIME[blob.type] || 'jpg';
        const path = task.keepName ? task.path : `${task.path}.${ext}`;
        zip.file(path, blob);
        task.row.file = path;
        task.row.status = 'ok';
      } catch (err) {
        task.row.status = `MISSING (${err.message})`;
        missing.push(`${task.path}  <-  ${task.url}  (${err.message})`);
      }
      done += 1;
      onProgress?.({ done, total: tasks.length });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const columns = ['trip', 'date', 'category', 'cost', 'assigned_to', 'notes', 'expense_id', 'source', 'file', 'status', 'original_url'];
  const csv = [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\r\n');
  zip.file('expenses.csv', '﻿' + csv); // BOM so Excel shows Arabic text correctly
  if (missing.length) zip.file('MISSING.txt', missing.join('\n'));

  // Images are already compressed, so just store them
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `trippy-receipts-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);

  return { files: tasks.length - missing.length, missing: missing.length };
}
