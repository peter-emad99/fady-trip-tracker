# Google Drive File Storage Migration Plan

## Overview

This document outlines the plan to migrate from Supabase Storage to Google Drive for receipt file storage.

---

## Why Google Drive?

### Advantages

- **15 GB free storage** (vs 1 GB on Supabase free tier)
- **Familiar interface** - users can access files directly
- **Better long-term storage** - files persist even if app is inactive
- **Shared folders** - easier collaboration
- **No bandwidth limits** on free tier

### Disadvantages

- More complex authentication flow
- Requires Google account
- Slightly slower upload/download
- Need to manage OAuth tokens

---

## Implementation Plan

### Phase 1: Setup Google Drive API

#### 1.1 Create Google Cloud Project

```bash
# Steps:
1. Go to https://console.cloud.google.com
2. Create new project: "Fady Trip Tracker"
3. Enable Google Drive API:
   - Go to "APIs & Services" → "Library"
   - Search "Google Drive API"
   - Click "Enable"
```

#### 1.2 Create OAuth 2.0 Credentials

```bash
# Steps:
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: "Web application"
4. Authorized JavaScript origins:
   - http://localhost:5173 (development)
   - https://your-app.vercel.app (production)
5. Authorized redirect URIs:
   - http://localhost:5173/auth/callback
   - https://your-app.vercel.app/auth/callback
6. Save Client ID and Client Secret
```

#### 1.3 Configure OAuth Consent Screen

```bash
# Steps:
1. Go to "OAuth consent screen"
2. User Type: "External"
3. App name: "Fady Trip Tracker"
4. User support email: your email
5. Scopes: Add "Google Drive API" → "../auth/drive.file"
6. Test users: Add your email
```

---

### Phase 2: Install Dependencies

```bash
npm install @react-oauth/google gapi-script
```

**Package purposes:**

- `@react-oauth/google` - Google OAuth login
- `gapi-script` - Google API client library

---

### Phase 3: Code Implementation

#### 3.1 Create Google Drive Service

**File:** `src/api/googleDriveService.js`

```javascript
import { gapi } from "gapi-script";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const SCOPES = "https://www.googleapis.com/auth/drive.file";

// Folder name in Google Drive
const FOLDER_NAME = "TripTracker_Receipts";

class GoogleDriveService {
  constructor() {
    this.folderId = null;
  }

  // Initialize Google API
  async init() {
    return new Promise((resolve, reject) => {
      gapi.load("client:auth2", async () => {
        try {
          await gapi.client.init({
            apiKey: API_KEY,
            clientId: CLIENT_ID,
            discoveryDocs: [
              "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
            ],
            scope: SCOPES,
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  // Sign in to Google
  async signIn() {
    const auth = gapi.auth2.getAuthInstance();
    if (!auth.isSignedIn.get()) {
      await auth.signIn();
    }
    await this.ensureFolder();
  }

  // Create or get receipts folder
  async ensureFolder() {
    if (this.folderId) return this.folderId;

    // Search for existing folder
    const response = await gapi.client.drive.files.list({
      q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id, name)",
    });

    if (response.result.files.length > 0) {
      this.folderId = response.result.files[0].id;
    } else {
      // Create folder
      const folderMetadata = {
        name: FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      };
      const folder = await gapi.client.drive.files.create({
        resource: folderMetadata,
        fields: "id",
      });
      this.folderId = folder.result.id;
    }

    return this.folderId;
  }

  // Upload file to Google Drive
  async uploadFile(file, fileName) {
    await this.ensureFolder();

    const metadata = {
      name: fileName,
      parents: [this.folderId],
    };

    const form = new FormData();
    form.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    );
    form.append("file", file);

    const response = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink",
      {
        method: "POST",
        headers: new Headers({
          Authorization: "Bearer " + gapi.auth.getToken().access_token,
        }),
        body: form,
      },
    );

    const result = await response.json();

    // Make file publicly accessible
    await gapi.client.drive.permissions.create({
      fileId: result.id,
      resource: {
        role: "reader",
        type: "anyone",
      },
    });

    // Return direct link
    return `https://drive.google.com/uc?export=view&id=${result.id}`;
  }

  // Delete file from Google Drive
  async deleteFile(fileUrl) {
    // Extract file ID from URL
    const fileId = fileUrl.match(/id=([^&]+)/)?.[1];
    if (!fileId) return;

    try {
      await gapi.client.drive.files.delete({
        fileId: fileId,
      });
    } catch (error) {
      console.error("Failed to delete file from Google Drive:", error);
    }
  }

  // Check if user is signed in
  isSignedIn() {
    const auth = gapi.auth2.getAuthInstance();
    return auth?.isSignedIn.get() || false;
  }

  // Sign out
  async signOut() {
    const auth = gapi.auth2.getAuthInstance();
    await auth.signOut();
  }
}

export const googleDriveService = new GoogleDriveService();
```

#### 3.2 Update ExpenseForm.jsx

Replace Supabase upload with Google Drive:

```javascript
// In ExpenseForm.jsx

import { googleDriveService } from "@/api/googleDriveService";

const handleFileUpload = async (files) => {
  try {
    setUploading(true);

    // Ensure user is signed in to Google
    if (!googleDriveService.isSignedIn()) {
      await googleDriveService.signIn();
    }

    const uploadPromises = Array.from(files).map(async (file) => {
      const fileName = `${Date.now()}_${file.name}`;
      const fileUrl = await googleDriveService.uploadFile(file, fileName);
      return { file_url: fileUrl };
    });

    const results = await Promise.all(uploadPromises);
    const newUrls = results.map((r) => r.file_url);

    const currentUrls = getValues("receipt_urls") || [];
    setValue("receipt_urls", [...currentUrls, ...newUrls]);
  } catch (error) {
    console.error("Upload failed", error);
    toast.error("Failed to upload receipt");
  } finally {
    setUploading(false);
  }
};
```

#### 3.3 Update TripDetails.jsx Delete Function

```javascript
// In TripDetails.jsx

import { googleDriveService } from "@/api/googleDriveService";

const deleteExpenseMutation = useMutation({
  mutationFn: async (expenseId) => {
    // Get expense to retrieve receipt URLs
    const { data: expense } = await supabase
      .from("expenses")
      .select("receipt_urls, receipt_url")
      .eq("id", expenseId)
      .single();

    // Delete receipt files from Google Drive
    if (expense) {
      const urlsToDelete =
        expense.receipt_urls ||
        (expense.receipt_url ? [expense.receipt_url] : []);

      for (const url of urlsToDelete) {
        try {
          await googleDriveService.deleteFile(url);
        } catch (err) {
          console.error("Failed to delete receipt file:", err);
        }
      }
    }

    // Delete the expense record
    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", expenseId);
    if (error) throw error;
  },
  onSuccess: () =>
    queryClient.invalidateQueries({ queryKey: ["expenses", id] }),
});
```

#### 3.4 Add Google Sign-In Button

**File:** `src/components/GoogleDriveAuth.jsx`

```javascript
import { useEffect, useState } from "react";
import { googleDriveService } from "@/api/googleDriveService";
import { Button } from "@/components/ui/button";

export default function GoogleDriveAuth() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initGoogleDrive = async () => {
      try {
        await googleDriveService.init();
        setIsSignedIn(googleDriveService.isSignedIn());
      } catch (error) {
        console.error("Failed to initialize Google Drive:", error);
      } finally {
        setLoading(false);
      }
    };

    initGoogleDrive();
  }, []);

  const handleSignIn = async () => {
    try {
      await googleDriveService.signIn();
      setIsSignedIn(true);
    } catch (error) {
      console.error("Sign in failed:", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await googleDriveService.signOut();
      setIsSignedIn(false);
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  if (loading) return null;

  return (
    <div className="flex items-center gap-2">
      {isSignedIn ? (
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          Sign out of Google Drive
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={handleSignIn}>
          Connect Google Drive
        </Button>
      )}
    </div>
  );
}
```

---

### Phase 4: Environment Variables

Add to `.env` and Vercel/Netlify:

```bash
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your-api-key
```

---

### Phase 5: Migration Strategy

#### Option A: Hard Cutover (Recommended for new apps)

1. Deploy Google Drive version
2. All new uploads go to Google Drive
3. Old Supabase files remain accessible (read-only)

#### Option B: Gradual Migration

1. Keep both systems running
2. Add feature flag to choose storage provider
3. Migrate old files in background
4. Switch to Google Drive only after migration

#### Option C: Dual Storage (Most Complex)

1. Upload to both Supabase and Google Drive
2. Gradually phase out Supabase
3. Highest reliability but more complex

---

### Phase 6: Testing Checklist

- [ ] Google OAuth flow works
- [ ] Files upload to correct folder
- [ ] Files are publicly accessible
- [ ] File deletion works
- [ ] Multiple file upload works
- [ ] Works on mobile browsers
- [ ] Works in production (not just localhost)
- [ ] Token refresh works (for long sessions)

---

### Phase 7: Rollback Plan

If Google Drive integration fails:

1. **Immediate:** Revert to Supabase storage
2. **Keep both:** Maintain dual storage temporarily
3. **Data safety:** All URLs stored in database remain valid

---

## Estimated Timeline

- **Phase 1-2:** 1-2 hours (Google Cloud setup)
- **Phase 3:** 3-4 hours (Code implementation)
- **Phase 4-5:** 1 hour (Environment setup)
- **Phase 6:** 2-3 hours (Testing)

**Total:** ~8-12 hours

---

## Cost Comparison

| Feature         | Supabase Free | Google Drive Free  |
| --------------- | ------------- | ------------------ |
| Storage         | 1 GB          | 15 GB              |
| Bandwidth       | 2 GB/month    | Unlimited\*        |
| File size limit | 50 MB         | 5 TB               |
| API calls       | Unlimited     | 1000/day (queries) |

\*Reasonable use policy applies

---

## Security Considerations

1. **OAuth tokens:** Store securely, refresh automatically
2. **File permissions:** Set to "anyone with link" (read-only)
3. **Folder isolation:** Each user could have separate folder
4. **Audit logs:** Google Drive provides access logs

---

## Future Enhancements

1. **User-specific folders:** Each user gets their own folder
2. **Shared trips:** Multiple users can access same receipts
3. **Offline support:** Cache files locally
4. **Bulk operations:** Upload/download multiple files at once
5. **File versioning:** Keep history of receipt updates

---

## Support & Resources

- [Google Drive API Docs](https://developers.google.com/drive/api/v3/about-sdk)
- [OAuth 2.0 Guide](https://developers.google.com/identity/protocols/oauth2)
- [React Google OAuth](https://www.npmjs.com/package/@react-oauth/google)
