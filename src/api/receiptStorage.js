import { supabase } from '@/api/supabaseClient';
import { isLocalReceipt, saveLocalReceipt, deleteLocalReceipt } from '@/lib/localReceipts';
import { isNetworkError } from '@/lib/network';

const DRIVE_URL_PREFIX = '/api/receipts?id=';
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session?.access_token}` };
}

// Shrinks phone photos so uploads stay fast and under the serverless body limit.
// Falls back to the original file if the browser can't decode it.
async function compressImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

// The server rejects bodies over 4 MB (Vercel's hard limit is 4.5 MB)
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

async function uploadBlob(body, namePrefix, ext) {
  const name = `${namePrefix}_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

  const res = await fetch(`/api/receipts?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { ...(await authHeader()), 'Content-Type': body.type || 'image/jpeg' },
    body,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Upload failed');

  const { url } = await res.json();
  return url;
}

// Uploads a receipt image to Google Drive and returns the URL to store on the expense.
export async function uploadReceipt(file, namePrefix) {
  const body = await compressImage(file);
  const ext = body.type === 'image/jpeg' ? 'jpg' : file.name.split('.').pop();
  return uploadBlob(body, namePrefix, ext);
}

// Uploads the receipt, or keeps it on this device (to upload later) when there's no connection.
// Returns the URL to store on the expense either way.
export async function uploadOrKeepLocal(file, namePrefix) {
  const keepLocal = async () => saveLocalReceipt(await compressImage(file), file.name || 'receipt.jpg');
  if (!navigator.onLine) return keepLocal();
  try {
    return await uploadReceipt(file, namePrefix);
  } catch (err) {
    if (isNetworkError(err)) return keepLocal();
    throw err;
  }
}

// Deletes a receipt from wherever it lives: this device (not uploaded yet), Google Drive, or the
// legacy Supabase bucket.
export async function deleteReceipt(url) {
  if (!url) return;

  if (isLocalReceipt(url)) {
    await deleteLocalReceipt(url);
    return;
  }

  if (url.startsWith(DRIVE_URL_PREFIX)) {
    const id = url.slice(DRIVE_URL_PREFIX.length);
    const res = await fetch(`/api/receipts?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: await authHeader(),
    });
    if (!res.ok) throw new Error('Failed to delete receipt from Google Drive');
    return;
  }

  // Legacy Supabase Storage URL: .../receipts/<filename>
  const parts = url.split('/receipts/');
  if (parts.length > 1) {
    const filePath = parts[1].split('?')[0];
    const { data, error } = await supabase.storage.from('receipts').remove([filePath]);
    if (error) throw error;
    // Supabase returns no error when a storage policy blocks the delete; it just removes nothing
    if (!data?.length) throw new Error('Supabase file was not deleted (missing or not allowed)');
  }
}

export const isDriveReceipt = (url) => !!url?.startsWith(DRIVE_URL_PREFIX);

// Files receipts into "Trippy Receipts/<trip>/<date - category - cost>/" in Drive, or renames a
// trip's folder. Only tidies folders, so failures are logged rather than shown to the user.
export async function organizeReceipts({ expenseId, tripId }) {
  try {
    const res = await fetch('/api/organize-receipts', {
      method: 'POST',
      headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
      body: JSON.stringify(expenseId ? { expenseId } : { tripId }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Organize failed (${res.status})`);
  } catch (err) {
    console.error('Failed to organize receipts in Google Drive', err);
  }
}

const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic' };

// Copies one old Supabase Storage receipt to Google Drive and points every expense that uses it at
// the Drive copy. The Supabase file is NOT deleted. The original is uploaded unchanged unless it's
// over the upload limit, and the Drive copy is downloaded back and checked before any expense changes.
export async function migrateLegacyReceipt(url, expenseIds) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status === 404 ? 'File no longer exists in Supabase' : `Download failed (${res.status})`);

  const fileName = decodeURIComponent(url.split('/').pop().split('?')[0]);
  let ext = (fileName.includes('.') ? fileName.split('.').pop() : 'jpg').toLowerCase();
  const original = await res.blob();
  const type = original.type.startsWith('image/') ? original.type : MIME_BY_EXT[ext] || 'image/jpeg';
  let body = new File([original], fileName, { type });

  if (body.size > MAX_UPLOAD_BYTES) {
    body = await compressImage(body);
    if (body.size > MAX_UPLOAD_BYTES) throw new Error('File is too large to upload, even after resizing');
    if (body.type === 'image/jpeg') ext = 'jpg';
  }

  const newUrl = await uploadBlob(body, expenseIds[0], ext);

  // Verify the Drive copy before touching any expense
  const check = await fetch(newUrl, { cache: 'no-store' });
  const copied = check.ok ? (await check.arrayBuffer()).byteLength : -1;
  if (copied !== body.size) {
    throw new Error(`Drive copy didn't match the original (${copied} vs ${body.size} bytes); expense left unchanged`);
  }

  for (const expenseId of expenseIds) {
    const { error } = await supabase.rpc('replace_receipt_url', {
      p_expense_id: expenseId,
      p_old_url: url,
      p_new_url: newUrl,
    });
    if (error) throw error;
  }

  for (const expenseId of expenseIds) await organizeReceipts({ expenseId });

  return { newUrl, resized: body.size !== original.size };
}
