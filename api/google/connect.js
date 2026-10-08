// GET /api/google/connect -> sends the Drive owner to Google's consent screen.
// One-time setup: the resulting refresh token goes into GOOGLE_REFRESH_TOKEN.
export function GET(request) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return new Response('Google Drive is not set up yet: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are missing on the server.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const state = crypto.randomUUID();
  const redirectUri = `${new URL(request.url).origin}/api/google/callback`;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file',
    access_type: 'offline',
    // consent: always return a refresh token; select_account: make sure the right account is picked
    prompt: 'consent select_account',
    state,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      'Set-Cookie': `g_oauth_state=${state}; Path=/api/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}
