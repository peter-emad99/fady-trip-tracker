import { json, requireUser, isAdmin, driveFetch, getReceiptFile, uploadFile, trashIfEmptyExpenseFolder } from './_lib/google.js';

// Vercel rejects request bodies over 4.5 MB; the client compresses images well below this.
const MAX_BYTES = 4 * 1024 * 1024;

// Raster formats only: an SVG can carry scripts, and receipts are served from the app's own origin
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

// GET /api/receipts?id=<fileId> -> streams the receipt image from Google Drive.
// Used directly as <img src>, so it can't require the auth header; file ids are unguessable.
export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id');

  try {
    const file = await getReceiptFile(id);
    if (!file) return json({ error: 'Not found' }, 404);

    const media = await driveFetch(`/files/${file.id}?alt=media`);
    // Anything uploaded before the type allow-list is downloaded rather than rendered
    const safe = ALLOWED_TYPES.includes(file.mimeType);
    return new Response(media.body, {
      headers: {
        'Content-Type': safe ? file.mimeType : 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        ...(safe ? {} : { 'Content-Disposition': 'attachment' }),
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
  const user = await requireUser(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const mimeType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return json({ error: 'Only JPEG, PNG, WebP, HEIC or GIF images are allowed' }, 400);
  }

  const data = await request.arrayBuffer();
  if (!data.byteLength) return json({ error: 'Empty file' }, 400);
  if (data.byteLength > MAX_BYTES) return json({ error: 'File too large' }, 413);

  const name = new URL(request.url).searchParams.get('name') || `${Date.now()}.jpg`;

  try {
    // Tag the uploader so only they (or an admin) can delete it later
    const file = await uploadFile({ name, mimeType, data, appProperties: { uploadedBy: user.id } });
    return json({ id: file.id, url: `/api/receipts?id=${file.id}` });
  } catch (err) {
    console.error(err);
    return json({ error: 'Upload to Google Drive failed' }, 500);
  }
}

// DELETE /api/receipts?id=<fileId> -> moves the receipt to the Drive trash.
export async function DELETE(request) {
  const user = await requireUser(request);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const id = new URL(request.url).searchParams.get('id');

  try {
    const file = await getReceiptFile(id);
    if (!file) return json({ ok: true });

    // Receipts uploaded before tagging have no owner, so any signed-in user may still delete those
    const owner = file.appProperties?.uploadedBy;
    if (owner && owner !== user.id && !(await isAdmin(request))) return json({ error: 'Forbidden' }, 403);

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
