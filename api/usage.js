import { json, checkUser, isAdmin, driveFetch } from './_lib/google.js';

// GET /api/usage -> Google Drive quota plus how much of it the receipts folder uses.
export async function GET(request) {
  const { error } = await checkUser(request);
  if (error) return error;
  if (!(await isAdmin(request))) return json({ error: 'Only admins can view usage' }, 403);

  try {
    const about = await driveFetch('/about?fields=storageQuota,user(emailAddress,displayName)').then((r) => r.json());

    // Receipts now live in trip/expense subfolders. The drive.file scope only lists files this
    // app created, so "every non-folder file" is exactly the receipts.
    const q = encodeURIComponent(`mimeType != 'application/vnd.google-apps.folder' and trashed=false`);
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
          accountEmail: about.user?.emailAddress || null,
          accountName: about.user?.displayName || null,
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
