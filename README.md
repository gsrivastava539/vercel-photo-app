# Digital Photo Request System

A modern web application for managing digital photo requests using **Vercel**, **Supabase**, **Dropbox**, and **Resend**.

## Tech Stack

| Component | Service | Free Tier |
|-----------|---------|-----------|
| Hosting & API | Vercel | 100GB bandwidth/month |
| Database | Supabase | 500MB, 50K users |
| File Storage | Dropbox | 2GB storage |
| Email | Resend | 3,000 emails/month |

---

## Quick Setup Guide

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **"New Project"**
3. Fill in:
   - Project name: `photo-request`
   - Database password: (generate a strong one, save it!)
   - Region: Choose closest to your users
4. Click **"Create new project"** and wait ~2 minutes

### Step 2: Create Database Tables

1. In your Supabase dashboard, go to **SQL Editor**
2. Click **"New query"**
3. Paste this SQL and click **"Run"**:

```sql
-- Accounts table (user authentication)
CREATE TABLE accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  reset_token TEXT,
  token_expiry TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admins table (admin emails)
CREATE TABLE admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Verification codes table
CREATE TABLE verification_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  dropbox_link TEXT,
  used_by_email TEXT,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add your admin email
INSERT INTO admins (email) VALUES ('your-email@gmail.com');
```

> **Important:** Replace `your-email@gmail.com` with your actual admin email!

### Step 3: Get Supabase Keys

1. In Supabase dashboard, go to **Settings** > **API**
2. Copy these values:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_KEY`

### Step 4: Create Resend Account

1. Go to [resend.com](https://resend.com) and sign up (free)
2. In the dashboard, go to **API Keys**
3. Click **"Create API Key"**
   - Name: `photo-app`
   - Permission: Full access
4. Copy the API key → `RESEND_API_KEY`

> **Note:** With the free tier, you can only send to your own email. To send to anyone, you'll need to verify a domain (easy process in Resend dashboard).

### Step 5: Get Dropbox Access Token

If you already have one from the previous setup, use that. Otherwise:

1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Click **"Create app"**
3. Choose:
   - API: Scoped access
   - Access: Full Dropbox
   - Name: `photo-request-app`
4. Click **"Create app"**
5. In app settings, go to **Permissions** tab and enable:
   - `files.content.write`
   - `files.content.read`
   - `sharing.write`
6. Go to **Settings** tab, scroll to **OAuth 2**, click **"Generate"** access token
7. Copy the token → `DROPBOX_ACCESS_TOKEN`

### Step 6: Deploy to Vercel

#### Option A: Deploy via GitHub (Recommended)

1. Push the `vercel-photo-app` folder to a new GitHub repository
2. Go to [vercel.com](https://vercel.com) and sign up with GitHub
3. Click **"Add New..."** > **"Project"**
4. Import your GitHub repository
5. Click **"Deploy"**

#### Option B: Deploy via CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Navigate to project
cd /Users/gaurav/Passportsizephoto/vercel-photo-app

# Login and deploy
vercel login
vercel
```

### Step 7: Add Environment Variables

1. In Vercel dashboard, go to your project
2. Click **Settings** > **Environment Variables**
3. Add these variables:

| Name | Value |
|------|-------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Your Supabase service_role key |
| `DROPBOX_ACCESS_TOKEN` | Your Dropbox access token |
| `RESEND_API_KEY` | Your Resend API key |
| `JWT_SECRET` | A random 32+ character string |

**To generate JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 8: Redeploy

After adding environment variables:
1. Go to **Deployments** tab
2. Click the three dots on the latest deployment
3. Click **"Redeploy"**

---

## Testing Your App

1. Visit your Vercel URL (e.g., `https://your-app.vercel.app`)
2. Create an account with your admin email
3. Log in - you should be redirected to the admin panel
4. Generate a verification code
5. Upload a photo to the Dropbox folder created
6. Log out and create a regular user account
7. Enter the code and check your email!

---

## Project Structure

```
vercel-photo-app/
├── api/                       # Serverless API endpoints
│   ├── auth/
│   │   ├── signup.js         # Create account
│   │   ├── login.js          # User login
│   │   ├── forgot.js         # Forgot password
│   │   ├── reset.js          # Reset password
│   │   └── verify.js         # Verify JWT token
│   ├── admin/
│   │   ├── create-code.js    # Generate verification code
│   │   ├── codes.js          # List all codes
│   │   └── clear-all.js      # Delete all data
│   └── request.js            # Process photo request
├── lib/                       # Helper libraries
│   ├── db.js                 # Supabase database
│   ├── dropbox.js            # Dropbox API
│   ├── email.js              # Resend email
│   └── auth.js               # JWT & password utils
├── public/                    # Frontend pages
│   ├── index.html            # Login + request page
│   ├── admin.html            # Admin panel
│   └── reset.html            # Password reset
├── package.json
├── vercel.json
└── README.md
```

---

## Sending Emails to Anyone (Domain Verification)

By default, Resend only allows sending to your own email. To send to anyone:

1. In Resend dashboard, go to **Domains**
2. Click **"Add Domain"**
3. Add your domain (e.g., `yourdomain.com`)
4. Add the DNS records shown to your domain provider
5. Wait for verification (usually < 5 minutes)
6. Update `lib/email.js` to use your domain:

```javascript
const FROM_EMAIL = 'Digital Photo <noreply@yourdomain.com>';
```

---

## Troubleshooting

### "Invalid API key" from Supabase
- Make sure you're using the `service_role` key (not `anon` key) for `SUPABASE_SERVICE_KEY`
- The `service_role` key bypasses Row Level Security

### "Cannot send to this email" from Resend
- Free tier only sends to your verified email
- Either verify a domain or upgrade Resend plan

### "Failed to create Dropbox folder"
- Check your access token is valid
- Make sure app permissions include `files.content.write`

### Login/Signup not working
- Check browser console for errors
- Verify all environment variables are set in Vercel
- Make sure you redeployed after adding env vars

---

## Custom Domain (Optional)

1. In Vercel dashboard, go to **Settings** > **Domains**
2. Add your custom domain
3. Update DNS as instructed
4. SSL is automatic!

---

## Local Development

```bash
cd vercel-photo-app

# Install dependencies
npm install

# Create .env file with your variables
# (copy from Vercel environment variables)

# Start local server
vercel dev
```

---

## Security Features

- **Row Level Security**: Supabase enforces data access at the database level
- **Password Hashing**: bcrypt with 10 rounds
- **JWT Tokens**: 24-hour expiry, secure signing
- **No Exposed Credentials**: All sensitive data in environment variables
- **HTTPS Only**: Vercel enforces SSL

---

## Support

Having issues? Check the troubleshooting section above or reach out!
