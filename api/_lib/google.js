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

// Optional comma-separated allow-list (Vercel env); when set, only these accounts may use the Drive API
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

// Verifies the Supabase session token sent by the browser and returns the user, or null.
export async function requireUser(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anonKey },
  });
  if (!res.ok) return null;
  const user = await res.json();
  if (ALLOWED_EMAILS.length && !ALLOWED_EMAILS.includes(user.email?.toLowerCase())) return null;
  return user;
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

// Returns file metadata for a receipt, or null for anything else (folders, trashed or unknown ids).
// The drive.file scope already limits the token to files this app created, so receipts can live
// in any trip/expense subfolder.
export async function getReceiptFile(fileId) {
  if (!/^[\w-]+$/.test(fileId || '')) return null;

  try {
    const file = await driveFetch(`/files/${fileId}?fields=id,name,mimeType,parents,trashed,appProperties`).then((r) => r.json());
    if (file.trashed || file.mimeType === FOLDER_MIME) return null;
    return file;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

// Reads rows through Supabase's REST API as the calling user, so row-level security applies.
export async function supabaseSelect(request, pathAndQuery) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/rest/v1/${pathAndQuery}`, {
    headers: { Authorization: request.headers.get('authorization'), apikey: anonKey },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

// Finds the folder tagged with { key: value } (e.g. tripId), creating it if needed, and keeps its
// name and parent up to date. Tagging by id means renaming a trip renames its folder.
export async function ensureFolder({ key, value, name, parentId, create = true }) {
  if (!/^[\w-]+$/.test(value || '')) throw new Error(`Invalid ${key}`);

  const q = `mimeType='${FOLDER_MIME}' and trashed=false and appProperties has { key='${key}' and value='${value}' }`;
  const { files } = await driveFetch(`/files?q=${encodeURIComponent(q)}&fields=files(id,name,parents)&pageSize=1`).then((r) => r.json());
  const folder = files?.[0];

  if (!folder) {
    if (!create) return null;
    const created = await driveFetch('/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId], appProperties: { [key]: value } }),
    }).then((r) => r.json());
    return created.id;
  }

  const moveParams = parentId && !folder.parents?.includes(parentId)
    ? `&addParents=${parentId}&removeParents=${(folder.parents || []).join(',')}`
    : '';
  if (folder.name !== name || moveParams) {
    await driveFetch(`/files/${folder.id}?fields=id${moveParams}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }
  return folder.id;
}

// Moves a file into a folder (and optionally renames it). The file id, and so its URL, stays the same.
export async function moveFile(file, { parentId, name }) {
  const oldParents = (file.parents || []).filter((id) => id !== parentId);
  const moveParams = file.parents?.includes(parentId) && !oldParents.length
    ? ''
    : `&addParents=${parentId}${oldParents.length ? `&removeParents=${oldParents.join(',')}` : ''}`;
  if (!moveParams && file.name === name) return oldParents;

  await driveFetch(`/files/${file.id}?fields=id${moveParams}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return oldParents;
}

// Trashes a folder tagged with `tagKey` once it's empty. Never touches the root folder.
// Returns the trashed folder's metadata, or null if it was kept.
async function trashIfEmpty(folderId, tagKey) {
  if (!folderId || folderId === (await getFolderId())) return null;

  const folder = await driveFetch(`/files/${folderId}?fields=mimeType,appProperties,parents,trashed`).then((r) => r.json());
  if (folder.trashed || folder.mimeType !== FOLDER_MIME || !folder.appProperties?.[tagKey]) return null;

  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const { files } = await driveFetch(`/files?q=${q}&fields=files(id)&pageSize=1`).then((r) => r.json());
  if (files?.length) return null;

  await driveFetch(`/files/${folderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
  return folder;
}

// Trashes an expense folder once its last receipt is gone, and then the trip folder once its last
// expense folder is gone (organizing recreates it when needed).
export async function trashIfEmptyExpenseFolder(folderId) {
  const folder = await trashIfEmpty(folderId, 'expenseId');
  for (const parentId of folder?.parents || []) await trashIfEmpty(parentId, 'tripId');
}

export async function uploadFile({ name, mimeType, data, appProperties }) {
  const folderId = await getFolderId();
  const boundary = `trippy-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name, parents: [folderId], appProperties });

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
