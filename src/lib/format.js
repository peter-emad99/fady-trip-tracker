import { format, parseISO } from 'date-fns';

const CURRENCY = 'EGP';
const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const withCents = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// One money format for the whole app: "EGP 1,250" or "EGP 1,250.50" (cents only when there are any)
export function formatMoney(value) {
  const amount = Number(value) || 0;
  const rounded = Math.round(amount * 100) / 100;
  const number = (Number.isInteger(rounded) ? wholeNumber : withCents).format(Math.abs(rounded));
  return `${rounded < 0 ? '-' : ''}${CURRENCY} ${number}`;
}

// Dates are stored as "YYYY-MM-DD". new Date() reads that as UTC midnight, which can land on the
// previous day; parseISO reads it as local midnight.
export function parseDate(value) {
  return typeof value === 'string' ? parseISO(value) : new Date(value);
}

export function formatDate(value, pattern = 'MMM d, yyyy') {
  return value ? format(parseDate(value), pattern) : '';
}

// Reads a typed amount: allows "1,250.50", spaces and Arabic-Indic digits (١٢٣) from Arabic keyboards.
// Returns NaN when it isn't a number.
export function parseAmount(value) {
  if (typeof value === 'number') return value;
  const normalized = String(value ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٫/g, '.')
    .replace(/[,\s٬]/g, '');
  return normalized === '' ? NaN : Number(normalized);
}
