# Deployment Guide

## Recommended Platform: **Vercel** ✅

**Why Vercel over Netlify for this app:**

- Better React/Vite integration out of the box
- Faster build times for React apps
- Automatic environment variable management
- Better serverless function support (if needed later)
- Free tier is generous for this use case

---

## Deploy to Vercel

### Prerequisites

1. GitHub account (you already have the repo pushed)
2. Vercel account (sign up at https://vercel.com with GitHub)

### Deployment Steps

#### Option 1: Using Vercel Dashboard (Easiest)

1. **Go to Vercel Dashboard**
   - Visit https://vercel.com/new
   - Sign in with GitHub

2. **Import Repository**
   - Click "Import Project"
   - Select your GitHub repository: `peter-emad99/fady-trip-tracker`
   - Click "Import"

3. **Configure Project**
   - **Framework Preset:** Vite
   - **Root Directory:** `./` (leave as is)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

4. **Environment Variables** (Important!)
   - Click "Environment Variables"
   - Add these variables:
     ```
     VITE_SUPABASE_URL=https://hvanbipjvniyilhqajvv.supabase.co
     VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2YW5iaXBqdm5peWlsaHFhanZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNzAzMjksImV4cCI6MjA4NDg0NjMyOX0.qPlYf9CksAQ2ZzPwDZ26lotnJQ756sULLbiNGtkCzX8
     ```
   - **Note:** Currently your Supabase credentials are hardcoded. For production, you should use environment variables.

5. **Deploy**
   - Click "Deploy"
   - Wait 2-3 minutes for build to complete
   - You'll get a live URL like: `https://fady-trip-tracker.vercel.app`

6. **Automatic Deployments**
   - Every push to `main` branch will auto-deploy
   - Preview deployments for pull requests

#### Option 2: Using Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy (from project root)
vercel

# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? Your account
# - Link to existing project? No
# - Project name? fady-trip-tracker
# - Directory? ./
# - Override settings? No

# For production deployment
vercel --prod
```

---

## Deploy to Netlify (Alternative)

### Steps

1. **Go to Netlify Dashboard**
   - Visit https://app.netlify.com
   - Sign in with GitHub

2. **Import Repository**
   - Click "Add new site" → "Import an existing project"
   - Choose GitHub and select `peter-emad99/fady-trip-tracker`

3. **Configure Build Settings**
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Base directory:** (leave empty)

4. **Environment Variables**
   - Go to Site settings → Environment variables
   - Add the same Supabase variables as above

5. **Deploy**
   - Click "Deploy site"
   - Get URL like: `https://fady-trip-tracker.netlify.app`

---

## Post-Deployment Checklist

### 1. Update Supabase Configuration (Important!)

After deployment, you need to configure Supabase to allow requests from your production domain:

1. Go to Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **API**
4. Under **URL Configuration**, add your production URL:
   - For Vercel: `https://fady-trip-tracker.vercel.app`
   - For Netlify: `https://fady-trip-tracker.netlify.app`

### 2. Test Core Features

- ✅ Create a new trip
- ✅ Add expenses with receipts
- ✅ Upload receipt images
- ✅ Delete expenses (verify receipts are deleted from storage)
- ✅ Export trip to PDF

### 3. Configure Custom Domain (Optional)

**Vercel:**

- Go to Project Settings → Domains
- Add your custom domain
- Update DNS records as instructed

**Netlify:**

- Go to Site settings → Domain management
- Add custom domain
- Update DNS records

---

## Troubleshooting

### Build Fails

**Error: "Module not found"**

- Ensure all dependencies are in `package.json`
- Run `npm install` locally to verify

**Error: "Out of memory"**

- Increase Node memory: Add to `package.json`:
  ```json
  "scripts": {
    "build": "NODE_OPTIONS='--max-old-space-size=4096' vite build"
  }
  ```

### App Loads but Shows Errors

**Supabase connection fails:**

- Check environment variables are set correctly
- Verify Supabase URL configuration allows your domain

**Images don't load:**

- Check Supabase Storage bucket is public
- Verify CORS settings in Supabase

### Performance Issues

- Enable Vercel Analytics (free tier)
- Check bundle size: `npm run build` and inspect `dist/` folder
- Consider code splitting for large components

---

## Monitoring & Analytics

### Vercel Analytics (Recommended)

1. Go to Project → Analytics
2. Enable Web Analytics (free)
3. Track page views, performance metrics

### Error Tracking

Consider adding:

- **Sentry** for error tracking
- **LogRocket** for session replay

---

## Cost Estimate

### Free Tier Limits

**Vercel Free:**

- 100 GB bandwidth/month
- Unlimited deployments
- 100 GB-hours compute time
- Perfect for this app's scale

**Netlify Free:**

- 100 GB bandwidth/month
- 300 build minutes/month
- Good for this app

**Supabase Free:**

- 500 MB database
- 1 GB file storage
- 2 GB bandwidth
- Should be sufficient for moderate use

### When to Upgrade

- If you exceed 1000 trips or 10,000 expenses
- If file storage exceeds 1 GB
- If you need team collaboration features

---

## Next Steps After Deployment

1. Share the live URL with users
2. Set up monitoring/alerts
3. Consider implementing:
   - User authentication (Supabase Auth)
   - Multi-user support
   - Data backup strategy
   - Google Drive integration (see GOOGLE_DRIVE_MIGRATION.md)
