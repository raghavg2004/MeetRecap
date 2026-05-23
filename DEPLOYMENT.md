# Render.com Deployment Guide

Deploy MeetRecap to a public server with HTTPS in 10 minutes.

## Prerequisites
- GitHub account (free)
- Render.com account (free tier available)
- Your project pushed to GitHub

## Step-by-Step Deployment

### 1. Push Your Project to GitHub
```bash
# Initialize git (if not already done)
cd "C:\Users\Raghav\Desktop\MeetRecap"
git init
git add .
git commit -m "Initial commit: MeetRecap video calling app"

# Create repo on GitHub at https://github.com/new
# Then push:
git remote add origin https://github.com/YOUR_USERNAME/MeetRecap.git
git branch -M main
git push -u origin main
```

### 2. Create Render Account & Connect GitHub
1. Go to https://render.com
2. Click **Sign Up** and select **Sign up with GitHub**
3. Authorize Render to access your GitHub account
4. Click **Dashboard**

### 3. Deploy Your App
1. Click **New +** → **Web Service**
2. Select your **MeetRecap** repository
3. Configure:
   - **Name:** `meetrecap` (or your preferred name)
   - **Environment:** Node
   - **Plan:** Free (or Starter for more uptime)
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Scroll down to **Environment Variables** and add all your `.env` values:

   ```
   NODE_ENV = production
   GMAIL_USER = your-email@gmail.com
   GMAIL_APP_PASSWORD = your-16-char-app-password
   OPENAI_API_KEY = sk-proj-...paste-your-openai-key...
   OPENAI_TRANSCRIBE_MODEL = whisper-1
   GROQ_API_KEY = gsk_...paste-your-groq-key...
   GROQ_TRANSCRIBE_MODEL = whisper-large-v3-turbo
   ENABLE_VOSK_TRANSCRIPTION = true
   VOSK_MODEL_PATH = vosk-model-small-en-us-0.15
   VOSK_HINDI_MODEL_PATH = vosk-model-small-hi-0.22
   SUPPORTED_TRANSCRIPTION_LANGUAGES = en,hi
   ENABLE_FALLBACK_TRANSCRIPTION = true
   PORT = 3000
   MAX_ROOM_SIZE = 12
   SESSION_SECRET = (run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
   JWT_SECRET = (run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
   JWT_EXPIRES_IN = 12h
   ALLOWED_ORIGIN = * (or your domain once you get it)
   ```

5. Click **Create Web Service**

### 4. Wait for Deployment
- Render will build and deploy automatically
- You'll see a URL like: `https://meetrecap.onrender.com`
- **First deployment takes 2-5 minutes**

### 5. Test Your Public Link
1. Go to your URL: `https://meetrecap.onrender.com`
2. Register/login
3. Create a meeting and test video/audio
4. Share the meeting link with others!

## Your Public Meeting Links

Once deployed, users can access meetings at:

```
https://meetrecap.onrender.com/meeting?meeting=YOUR_MEETING_ID
```

Example:
- Dashboard: `https://meetrecap.onrender.com/dashboard`
- Meeting: `https://meetrecap.onrender.com/meeting?meeting=ABC123`

## Important Notes

### ⚠️ Free Tier Limitations
- App goes to sleep after 15 min of inactivity (wakes up on request, ~30 sec delay)
- Resets every month
- Perfect for testing/small usage

### 💡 Upgrade to Starter ($7/month)
For better performance:
- Always-on service (no sleep)
- Better uptime guarantee
- Recommended for production use

### 🔐 Security
- HTTPS is **automatic** on Render.com
- Your API keys are encrypted in environment variables
- Consider rotating `SESSION_SECRET` and `JWT_SECRET` periodically

### 📱 WebRTC on Public Internet
Your app uses **peer-to-peer WebRTC**, which works over HTTPS. For better connectivity behind NAT:

Optional: Add TURN server settings in environment:
```
TURN_URL = turn:your-turn-server.com:3478
TURN_USERNAME = user
TURN_CREDENTIAL = pass
```

## Troubleshooting

### "Build failed" / "npm error - ffi-napi compilation error"
This happens on Render.com with newer Node versions. **Solution:**

1. In **Render Dashboard** → Your Web Service → **Settings**
2. Scroll to **Environment** section
3. Add environment variable:
   ```
   NODE_VERSION = 18
   ```
4. Click **Save** and **Deploy** again

Or let Render auto-detect from `.nvmrc` file (already included in your project).

### "App is not loading" / "Cannot connect"
- Wait for initial deployment (2-5 min)
- Check deployment logs in Render dashboard
- Verify all env vars are set correctly

### "Meeting creation fails"
- Check Node console in browser DevTools (F12)
- Verify JWT_SECRET and SESSION_SECRET are set

### "Video/audio not working"
- HTTPS is required (Render provides this)
- Check browser permissions (allow camera/mic)
- Try Chrome or Edge for best compatibility

### "FFmpeg errors on deployment"
- FFmpeg is included via `ffmpeg-static` in package.json
- If still fails, check Render build logs

## Next Steps

1. **Share your public link:**
   ```
   https://meetrecap.onrender.com
   ```

2. **Create custom domain (optional):**
   - In Render dashboard → Custom Domain
   - Point your own domain (e.g., `meet.yourcompany.com`)

3. **Monitor usage:**
   - Render dashboard shows logs and analytics
   - Free tier gets ~400 free dyno hours/month

---

**Questions?** Check the Render.com docs: https://render.com/docs
