import {
  json,
  checkUser,
  supabaseSelect,
  getFolderId,
  getReceiptFile,
  ensureFolder,
  moveFile,
  trashIfEmptyExpenseFolder,
} from './_lib/google.js';

const DRIVE_URL_PREFIX = '/api/receipts?id=';
const ID_PATTERN = /^[\w-]+$/;

// Drive allows almost any character, but keep names tidy and reasonably short.
function cleanName(value) {
  return String(value).replace(/[\r\n\t/\\]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function expenseFolderName(expense) {
  const cost = Number(expense.cost || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return cleanName(`${expense.date || 'No date'} - ${expense.category || 'Other'} - ${cost} EGP`);
}

function driveIds(expense) {
  const urls = expense.receipt_urls?.length ? expense.receipt_urls : expense.receipt_url ? [expense.receipt_url] : [];
  return urls.filter((u) => u?.startsWith(DRIVE_URL_PREFIX)).map((u) => u.slice(DRIVE_URL_PREFIX.length));
}

// POST /api/organize-receipts
//   { expenseId } -> files that expense's receipts under "Trippy Receipts/<trip>/<date - category - cost>/"
//   { tripId }    -> renames the trip's folder after the trip is renamed (doesn't create one)
// The caller must be able to read the rows (row-level security applies).
export async function POST(request) {
  const { error: authError } = await checkUser(request);
  if (authError) return authError;

  const { expenseId, tripId } = await request.json().catch(() => ({}));

  try {
    if (tripId) {
      if (!ID_PATTERN.test(tripId)) return json({ error: 'Invalid tripId' }, 400);
      const [trip] = await supabaseSelect(request, `trips?id=eq.${tripId}&select=id,name`);
      if (!trip) return json({ error: 'Trip not found' }, 404);

      await ensureFolder({ key: 'tripId', value: trip.id, name: cleanName(trip.name), create: false });
      return json({ ok: true });
    }

    if (!ID_PATTERN.test(expenseId || '')) return json({ error: 'Invalid expenseId' }, 400);

    const [expense] = await supabaseSelect(
      request,
      `expenses?id=eq.${expenseId}&select=id,trip_id,date,category,cost,receipt_urls,receipt_url`,
    );
    if (!expense) return json({ error: 'Expense not found' }, 404);

    const ids = driveIds(expense);
    if (!ids.length) return json({ ok: true, moved: 0 });

    const [trip] = await supabaseSelect(request, `trips?id=eq.${expense.trip_id}&select=id,name`);
    if (!trip) return json({ error: 'Trip not found' }, 404);

    const rootId = await getFolderId();
    const tripFolderId = await ensureFolder({ key: 'tripId', value: trip.id, name: cleanName(trip.name), parentId: rootId });
    const expenseFolderId = await ensureFolder({
      key: 'expenseId',
      value: expense.id,
      name: expenseFolderName(expense),
      parentId: tripFolderId,
    });

    const oldParents = new Set();
    for (const [i, id] of ids.entries()) {
      const file = await getReceiptFile(id);
      if (!file) continue;
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
      const left = await moveFile(file, { parentId: expenseFolderId, name: `Receipt ${i + 1}.${ext}` });
      left.forEach((p) => oldParents.add(p));
    }

    // A receipt may have come from another expense's folder; drop that folder if it's now empty
    for (const folderId of oldParents) await trashIfEmptyExpenseFolder(folderId);

    return json({ ok: true, moved: ids.length });
  } catch (err) {
    console.error(err);
    return json({ error: 'Failed to organize receipts' }, 500);
  }
}
