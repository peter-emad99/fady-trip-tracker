import { json, requireUser, driveFetch, getReceiptFile, uploadFile, trashIfEmptyExpenseFolder } from './_lib/google.js';

// Vercel rejects request bodies over 4.5 MB; the client compresses images well below this.
const MAX_BYTES = 4 * 1024 * 1024;

// GET /api/receipts?id=<fileId> -> streams the receipt image from Google Drive.
// Used directly as <img src>, so it can't require the auth header; file ids are unguessable.
export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id');

  try {
    const file = await getReceiptFile(id);
    if (!file) return json({ error: 'Not found' }, 404);

    const media = await driveFetch(`/files/${file.id}?alt=media`);
    return new Response(media.body, {
      headers: {
        'Content-Type': file.mimeType,
        // Drive file content never changes for a given id, so let the CDN cache it.
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      },
    });
  } catch (err) {
    console.error(err);
    return json({ error: 'Failed to load receipt' }, 500);
  }
}

// POST /api/receipts?name=<fileName> with the raw image as the body.
export async function POST(request) {
  if (!(await requireUser(request))) return json({ error: 'Unauthorized' }, 401);

  const mimeType = request.headers.get('content-type') || '';
  if (!mimeType.startsWith('image/')) return json({ error: 'Only images are allowed' }, 400);

  const data = await request.arrayBuffer();
  if (!data.byteLength) return json({ error: 'Empty file' }, 400);
  if (data.byteLength > MAX_BYTES) return json({ error: 'File too large' }, 413);

  const name = new URL(request.url).searchParams.get('name') || `${Date.now()}.jpg`;

  try {
    const file = await uploadFile({ name, mimeType, data });
    return json({ id: file.id, url: `/api/receipts?id=${file.id}` });
  } catch (err) {
    console.error(err);
    return json({ error: 'Upload to Google Drive failed' }, 500);
  }
}

// DELETE /api/receipts?id=<fileId> -> moves the receipt to the Drive trash.
export async function DELETE(request) {
  if (!(await requireUser(request))) return json({ error: 'Unauthorized' }, 401);

  const id = new URL(request.url).searchParams.get('id');

  try {
    const file = await getReceiptFile(id);
    if (!file) return json({ ok: true });

    await driveFetch(`/files/${file.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    });
    // Remove the expense's folder too once its last receipt is gone
    for (const parentId of file.parents || []) await trashIfEmptyExpenseFolder(parentId);
    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ error: 'Delete failed' }, 500);
  }
}
