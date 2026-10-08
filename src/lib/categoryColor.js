// Each category gets a steady colour (same name, same colour everywhere), so the list scans faster.
// Whole class names are spelled out because Tailwind only ships classes it can see in the source.
const TONES = [
  { badge: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
  { badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  { badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  { badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  { badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  { badge: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  { badge: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  { badge: 'bg-slate-200 text-slate-700', dot: 'bg-slate-500' },
];

export function categoryTone(name = '') {
  let hash = 0;
  for (const char of name.trim().toLowerCase()) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}
