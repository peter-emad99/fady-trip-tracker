import { formatDate } from '@/lib/format';

// Quotes a value for CSV. Text that starts like a formula (=, +, @) is prefixed with ' so Excel
// shows it instead of running it.
export function csvCell(value) {
  let text = String(value ?? '');
  if (typeof value === 'string' && /^[=+@\t\r]|^-(?!\d)/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns, rows) {
  const header = columns.map((c) => csvCell(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => csvCell(c.value(row))).join(','));
  // BOM so Excel opens Arabic text correctly
  return '﻿' + [header, ...lines].join('\r\n');
}

export function downloadFile(content, fileName, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(name) {
  return String(name || 'Trip').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, '_').slice(0, 80);
}

function receiptLinks(expense) {
  const urls = expense.receipt_urls?.length ? expense.receipt_urls : expense.receipt_url ? [expense.receipt_url] : [];
  // Full links, so they open from Excel; receipts still waiting to upload have none yet
  return urls.filter((u) => !u.startsWith('local:')).map((u) => new URL(u, window.location.origin).href);
}

// Spreadsheet of expenses, newest first. Pass `trips` to add a Trip column (all-trips export).
export function expensesCsv(expenses, { budgets = [], trips } = {}) {
  const budgetName = Object.fromEntries(budgets.map((b) => [b.id, b.name]));
  const tripName = trips && Object.fromEntries(trips.map((t) => [t.id, t.name]));
  const columns = [
    ...(tripName ? [{ label: 'Trip', value: (e) => tripName[e.trip_id] || '' }] : []),
    { label: 'Date', value: (e) => e.date || '' },
    { label: 'Day', value: (e) => formatDate(e.date, 'EEE') },
    { label: 'Category', value: (e) => e.category || '' },
    { label: 'Amount (EGP)', value: (e) => Number(e.cost || 0) },
    { label: 'Assigned to', value: (e) => e.assigned_to || '' },
    { label: 'Sub-budget', value: (e) => budgetName[e.trip_budget_id] || '' },
    { label: 'Notes', value: (e) => e.notes || '' },
    { label: 'Receipts', value: (e) => receiptLinks(e).length },
    { label: 'Receipt links', value: (e) => receiptLinks(e).join(' ') },
  ];
  const sorted = [...expenses].sort(
    (a, b) => (b.date || '').localeCompare(a.date || '') || String(b.created_at || '').localeCompare(String(a.created_at || '')),
  );
  return toCsv(columns, sorted);
}
