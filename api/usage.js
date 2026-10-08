import { json, requireUser, isAdmin, driveFetch, getFolderId } from './_lib/google.js';

// GET /api/usage -> Google Drive quota plus how much of it the receipts folder uses.
export async function GET(request) {
  if (!(await requireUser(request))) return json({ error: 'Unauthorized' }, 401);
  if (!(await isAdmin(request))) return json({ error: 'Only admins can view usage' }, 403);

  try {
    const about = await driveFetch('/about?fields=storageQuota').then((r) => r.json());

    const folderId = await getFolderId();
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let receiptsBytes = 0;
    let receiptsCount = 0;
    let pageToken = '';

    do {
      const page = await driveFetch(
        `/files?q=${q}&fields=nextPageToken,files(size)&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`,
      ).then((r) => r.json());
      for (const file of page.files || []) {
        receiptsBytes += Number(file.size || 0);
        receiptsCount += 1;
      }
      pageToken = page.nextPageToken || '';
    } while (pageToken);

    const quota = about.storageQuota || {};
    return json(
      {
        drive: {
          limit: quota.limit ? Number(quota.limit) : null, // null = unlimited
          usage: Number(quota.usage || 0),
          usageInDrive: Number(quota.usageInDrive || 0),
          usageInTrash: Number(quota.usageInDriveTrash || 0),
          receiptsBytes,
          receiptsCount,
        },
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (err) {
    console.error(err);
    return json({ error: 'Failed to read Google Drive usage' }, 500);
  }
}
