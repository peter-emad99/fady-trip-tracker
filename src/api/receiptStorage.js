import { supabase } from '@/api/supabaseClient';

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

// Uploads a receipt image to Google Drive and returns the URL to store on the expense.
export async function uploadReceipt(file, namePrefix) {
  const body = await compressImage(file);
  const ext = body.type === 'image/jpeg' ? 'jpg' : file.name.split('.').pop();
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

// Deletes a receipt from wherever it lives: Google Drive, or the legacy Supabase bucket.
export async function deleteReceipt(url) {
  if (!url) return;

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
    const { error } = await supabase.storage.from('receipts').remove([filePath]);
    if (error) throw error;
  }
}
