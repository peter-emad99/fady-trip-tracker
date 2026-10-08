// Shared helpers for the Google Drive serverless functions.
// Files in `api/_lib` are not exposed as routes by Vercel.

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME = 'Trippy Receipts';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

let cachedToken = null; // { value, expiresAt }
let cachedFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || null;

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// Verifies the Supabase session token sent by the browser.
export async function requireUser(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anonKey },
  });
  if (!res.ok) return null;
  return res.json();
}

// Checks the `is_admin` flag (profiles table) for the user behind the request's session token.
export async function isAdmin(request) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: {
      Authorization: request.headers.get('authorization'),
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  return res.ok && (await res.json()) === true;
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

export async function driveFetch(path, { upload = false, ...options } = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${upload ? DRIVE_UPLOAD_API : DRIVE_API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  if (!res.ok) {
    const err = new Error(`Drive API ${res.status}: ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

// Finds (or creates once) the folder that holds all receipts.
export async function getFolderId() {
  if (cachedFolderId) return cachedFolderId;

  const q = `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`;
  const list = await driveFetch(`/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`).then((r) => r.json());

  if (list.files?.length) {
    cachedFolderId = list.files[0].id;
  } else {
    const folder = await driveFetch('/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
    }).then((r) => r.json());
    cachedFolderId = folder.id;
  }

  return cachedFolderId;
}

// Returns file metadata only if the file is a receipt inside our folder.
// Prevents the API from touching anything else (e.g. the folder itself).
export async function getReceiptFile(fileId) {
  if (!/^[\w-]+$/.test(fileId || '')) return null;

  const folderId = await getFolderId();
  try {
    const file = await driveFetch(`/files/${fileId}?fields=id,mimeType,parents,trashed`).then((r) => r.json());
    if (file.trashed || file.mimeType === FOLDER_MIME || !file.parents?.includes(folderId)) return null;
    return file;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

export async function uploadFile({ name, mimeType, data }) {
  const folderId = await getFolderId();
  const boundary = `trippy-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name, parents: [folderId] });

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
    Buffer.from(data),
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  return driveFetch('/files?uploadType=multipart&fields=id', {
    upload: true,
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  }).then((r) => r.json());
}
