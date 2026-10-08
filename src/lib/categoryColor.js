// Category colours. A category's chosen colour is stored by key in categories.color; categories
// without one get a steady automatic colour from their name. Whole class names are spelled out
// because Tailwind only ships classes it can see in the source. `hex` is the 500 shade, for charts.
export const CATEGORY_COLORS = [
  { key: 'indigo', label: 'Indigo', badge: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500', hex: '#6366f1' },
  { key: 'blue', label: 'Blue', badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500', hex: '#3b82f6' },
  { key: 'sky', label: 'Sky', badge: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500', hex: '#0ea5e9' },
  { key: 'teal', label: 'Teal', badge: 'bg-teal-100 text-teal-700', dot: 'bg-teal-500', hex: '#14b8a6' },
  { key: 'emerald', label: 'Emerald', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', hex: '#10b981' },
  { key: 'green', label: 'Green', badge: 'bg-green-100 text-green-700', dot: 'bg-green-500', hex: '#22c55e' },
  { key: 'amber', label: 'Amber', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500', hex: '#f59e0b' },
  { key: 'orange', label: 'Orange', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500', hex: '#f97316' },
  { key: 'red', label: 'Red', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500', hex: '#ef4444' },
  { key: 'pink', label: 'Pink', badge: 'bg-pink-100 text-pink-700', dot: 'bg-pink-500', hex: '#ec4899' },
  { key: 'purple', label: 'Purple', badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500', hex: '#a855f7' },
  { key: 'slate', label: 'Grey', badge: 'bg-slate-200 text-slate-700', dot: 'bg-slate-500', hex: '#64748b' },
];

const BY_KEY = Object.fromEntries(CATEGORY_COLORS.map((c) => [c.key, c]));

// The chosen colour (key), or an automatic one based on the name
export function categoryTone(name = '', colorKey) {
  if (colorKey && BY_KEY[colorKey]) return BY_KEY[colorKey];
  let hash = 0;
  for (const char of name.trim().toLowerCase()) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}

// { "Food": "amber", ... } from the categories list, for looking colours up by an expense's category name
export function categoryColorMap(categories = []) {
  return Object.fromEntries(categories.filter((c) => c.color).map((c) => [c.name, c.color]));
}

// A colour for a new category: the first one no other category uses yet
export function nextFreeColor(categories = []) {
  const used = new Set(categories.map((c) => c.color));
  return (CATEGORY_COLORS.find((c) => !used.has(c.key)) || CATEGORY_COLORS[0]).key;
}
