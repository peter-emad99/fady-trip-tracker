// GET /api/google/callback -> exchanges Google's code for a refresh token and shows it once,
// so the Drive owner can copy it and send it to whoever manages the Vercel settings.
// When ALLOWED_EMAILS is set, only those Google accounts get a code; others are refused.
import { mayConnectDrive } from '../_lib/google.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function formatBytes(bytes) {
  if (!bytes) return 'unlimited';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

function page(title, body, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body{font-family:system-ui,sans-serif;background:#f9fafb;color:#0f172a;margin:0;padding:24px 16px}
  main{max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px}
  h1{font-size:22px;margin:0 0 12px} p{line-height:1.5;color:#475569}
  textarea{width:100%;box-sizing:border-box;height:110px;font:13px monospace;padding:10px;border:1px solid #cbd5e1;border-radius:10px}
  button{margin-top:10px;background:#4f46e5;color:#fff;border:0;border-radius:999px;padding:12px 22px;font-size:16px;cursor:pointer}
  .box{background:#eef2ff;border-radius:10px;padding:12px;margin:12px 0;color:#3730a3}
</style></head><body><main>${body}</main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = request.headers.get('cookie')?.match(/(?:^|;\s*)g_oauth_state=([^;]+)/)?.[1];

  if (url.searchParams.get('error')) {
    return page('Not connected', `<h1>Not connected</h1><p>Access was not granted (${escapeHtml(url.searchParams.get('error'))}). You can open the link again and try once more.</p>`, 400);
  }
  if (!code || !state || state !== cookieState) {
    return page('Link expired', '<h1>This link expired</h1><p>Please open the original connect link again and repeat the steps.</p>', 400);
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenRes.json();

  if (!tokenRes.ok || !tokens.refresh_token) {
    console.error('Google token exchange failed', tokens);
    return page('Something went wrong', '<h1>Something went wrong</h1><p>Please open the original connect link again and repeat the steps.</p>', 500);
  }

  // Show which account was connected and how much space it has, so it's easy to confirm it's the right one
  const about = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress),storageQuota', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  }).then((r) => (r.ok ? r.json() : {}));

  const email = about.user?.emailAddress;
  if (!email || !mayConnectDrive(email)) {
    // Cancel the access Google just granted, so the unused code is worthless
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.refresh_token)}`, { method: 'POST' }).catch(() => {});
    console.warn(`Drive connect refused for ${email || 'unknown account'}: not in ALLOWED_EMAILS`);
    return page(
      'Account not allowed',
      `<h1>This Google account isn't allowed</h1>
<p><b>${escapeHtml(email || 'This account')}</b> isn't on the list of accounts that can connect the receipts Google Drive, so nothing was connected.</p>
<p>Open the connect link again and choose an allowed account, or ask the app owner to add this email to <code>ALLOWED_EMAILS</code>.</p>`,
      403,
    );
  }

  return page(
    'Google Drive connected',
    `<h1>✅ Google Drive connected</h1>
<div class="box">Account: <b>${escapeHtml(about.user?.emailAddress || 'unknown')}</b><br>
Storage: ${formatBytes(Number(about.storageQuota?.usage || 0))} used of ${formatBytes(Number(about.storageQuota?.limit || 0))}</div>
<p>Check the account above is the right one. Then press <b>Copy</b> and send the code privately to the person who sent you the link.</p>
<textarea id="t" readonly>${escapeHtml(tokens.refresh_token)}</textarea>
<button onclick="navigator.clipboard.writeText(document.getElementById('t').value).then(()=>{this.textContent='Copied ✓'})">Copy</button>
<p style="font-size:13px">Keep this code private. You can close this page after sending it.</p>`,
  );
}
