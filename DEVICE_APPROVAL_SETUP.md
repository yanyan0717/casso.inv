# 🔐 Device Approval System Setup Guide

This guide walks you through setting up the device approval feature for the Casso Inventory System. This feature sends Gmail notifications when a new device attempts to login and allows users to approve or deny the login.

## 📋 Prerequisites

- Gmail account with 2-Factor Authentication enabled
- Node.js 18+ installed
- Firebase CLI (`firebase` command available - already installed globally)
- Access to your Firebase project (casso-inv)

---

## 🚀 Step 1: Generate Gmail App Password

Gmail requires an "App Password" for third-party applications (regular Gmail passwords won't work for security reasons).

### Steps:
1. Go to [Google Account Security Settings](https://myaccount.google.com/security)
2. Ensure **2-Step Verification** is enabled (required for App Passwords)
3. Look for **"App Passwords"** in the security menu (you must be signed in to your Gmail account)
4. Select:
   - App: **Mail**
   - Device: **Windows/Mac (or your device)**
5. Google will generate a 16-character password (e.g., `abcd efgh ijkl mnop`)
6. **Copy this password** - you'll use it in Step 3

**Note:** If you don't see "App Passwords" option:
- Make sure 2-Step Verification is ON
- Make sure you're using a personal Gmail account (not a business account with custom security policies)

---

## 📦 Step 2: Install Cloud Functions Dependencies

Navigate to the `functions` folder and install dependencies:

```bash
cd functions
npm install
cd ..
```

This installs:
- `firebase-admin` - Firebase server SDK
- `firebase-functions` - Cloud Functions library  
- `nodemailer` - Email sending library

---

## 🔐 Step 3: Configure Firebase with Gmail Credentials

Set your Gmail email and app password as Firebase environment variables:

```bash
firebase functions:config:set gmail.email="your-email@gmail.com" gmail.password="your-app-password"
```

**Replace:**
- `your-email@gmail.com` - Your actual Gmail address
- `your-app-password` - The 16-character password from Step 1 (without spaces)

**Verify the configuration was set:**

```bash
firebase functions:config:get
```

You should see output like:
```
{
  "gmail": {
    "email": "your-email@gmail.com",
    "password": "[SECRET]"
  }
}
```

---

## 🌐 Step 4: Set Your App Domain

The approval emails contain links that users click. You need to set your app's domain:

### Option A: Using Firebase Hosting (Recommended)
If you're hosting on Firebase Hosting:
```bash
firebase functions:config:set app.domain="https://your-project.web.app"
```

### Option B: Using Custom Domain
```bash
firebase functions:config:set app.domain="https://yourdomain.com"
```

### Option C: Local Testing
For local testing with emulator:
```bash
firebase functions:config:set app.domain="http://localhost:5173"
```

**Update the approval endpoint URL in `functions/index.js` if needed:**
Look for the `appDomain` variable and ensure it matches your actual domain.

---

## 🛠️ Step 5: Add Approval Routes to Your React App

The device approval pages need to be accessible at these URLs:
- `/approve-device` - When user clicks "Approve" button in email
- `/deny-device` - When user clicks "Deny" button in email

### Update your App.tsx or routing configuration:

```typescript
import DeviceApprovalPage from './auth/DeviceApprovalPage';

// In your router configuration:
{
  path: '/approve-device',
  element: <DeviceApprovalPage />,
},
{
  path: '/deny-device', 
  element: <DeviceApprovalPage />,
},
```

The `DeviceApprovalPage` component automatically detects which action (approve/deny) is needed based on the URL pathname.

---

## 📤 Step 6: Deploy Cloud Functions

### 6.1 Deploy Functions
```bash
firebase deploy --only functions
```

This deploys:
- `requestDeviceApproval` - Called when user tries to login from new device
- `handleDeviceApproval` - Processes approve/deny actions from email links

### 6.2 Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

This deploys security rules that protect user data.

### Verify Deployment
Check Firebase Console → Cloud Functions to see your deployed functions:
- `requestDeviceApproval` (callable)
- `handleDeviceApproval` (HTTP trigger)

---

## ✅ Step 7: Update Production Domain in Email Links

The approval links in emails currently point to `https://yourdomain.com` (from Cloud Function code).

You need to update this to your actual production domain:

1. **Update `functions/index.js`** (line ~85):
```javascript
const appDomain = process.env.APP_DOMAIN || 'https://youractual-domain.com';
```

2. **Or use environment variable** (recommended):
```bash
firebase functions:config:set app.domain="https://youractual-domain.com"
firebase deploy --only functions
```

---

## 🧪 Step 8: Test the Feature

### Test Flow:
1. **Clear browser storage** to simulate a new device:
   - Open DevTools → Application → Local Storage → Clear casso_device_id

2. **Try logging in:**
   - Go to `/login`
   - Enter credentials
   - If device not approved, you should see the "Check your email" modal

3. **Check your Gmail:**
   - Look for email from "Casso Inventory System"
   - Click the "Approve Device" or "Deny Access" button
   - You should see a success/confirmation page

4. **Try logging in again:**
   - Go back to login page
   - Enter same credentials
   - This time, the device should be approved and you'll be logged in

---

## 📁 File Structure

```
casso.inv-main/
├── functions/
│   ├── package.json          # Cloud Functions dependencies
│   └── index.js              # Main Cloud Functions code
├── src/
│   ├── lib/
│   │   ├── deviceService.ts            # Device ID generation
│   │   └── deviceApprovalService.ts    # Device approval logic
│   ├── components/
│   │   └── DeviceApprovalModal.tsx     # Modal shown when device not approved
│   └── auth/
│       ├── Login.tsx                   # Updated login with device check
│       └── DeviceApprovalPage.tsx      # Handles approve/deny links
├── firestore.rules           # Firestore security rules
└── .firebaserc               # Firebase project config
```

---

## 🔍 Troubleshooting

### "Gmail is not configured"
- Run: `firebase functions:config:get`
- Verify `gmail.email` and `gmail.password` are set
- Re-run Step 3 if they're missing

### Emails not being sent
1. Check Cloud Functions logs:
   ```bash
   firebase functions:log
   ```
2. Verify Gmail App Password is correct (should be 16 characters without spaces)
3. Verify 2-Factor Authentication is enabled on your Gmail account
4. Check if the email address is correct in config

### "Invalid approval link"
1. Verify your app domain is correct in Cloud Function
2. Make sure `/approve-device` and `/deny-device` routes exist in React app
3. Check that URLs in emails match your actual domain

### "Device ID not matching"
- Clear localStorage in browser
- The device ID is generated per device and stored in localStorage
- Clearing it will simulate a new device

---

## 🔒 Security Best Practices

1. **Never share your App Password** - It's a secret credential
2. **Use HTTPS** - All approval links must be over HTTPS
3. **Token Expiration** - Approval tokens expire in 30 minutes
4. **User Verification** - Users must approve devices via email
5. **Rate Limiting** - Consider adding rate limiting for abuse prevention

---

## 🛑 Disabling Device Approval

To temporarily disable device approval:

1. Comment out device check in `src/auth/Login.tsx`:
```typescript
// if (!approved) {
//   // ... device not approved logic
// }
```

2. Or delete the device approval check entirely and proceed with normal login

---

## 📝 Production Checklist

Before going live, ensure:

- [ ] Gmail App Password is set in Firebase
- [ ] Cloud Functions deployed successfully
- [ ] Firestore rules deployed
- [ ] Approval routes (`/approve-device`, `/deny-device`) added to your app
- [ ] App domain is correctly set (not localhost)
- [ ] Test approval flow works end-to-end
- [ ] Check Cloud Function logs for errors
- [ ] Verify emails are being sent to users
- [ ] Test on multiple browsers/devices

---

## 📞 Support

If you encounter issues:

1. Check Cloud Function logs: `firebase functions:log`
2. Check browser console for errors
3. Verify all configuration steps are complete
4. Ensure Gmail account has 2-FA enabled
5. Test with the emulator: `firebase emulators:start`

---

## 🔄 Updating the System

If you need to modify email templates, approval logic, or add new features:

1. Edit `functions/index.js`
2. Test locally: `firebase emulators:start --only functions`
3. Deploy: `firebase deploy --only functions`

Changes are live immediately after deployment.

---

**Last Updated:** 2024  
**Version:** 1.0
