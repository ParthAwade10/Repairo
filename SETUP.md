# Quick Setup Guide

## Step-by-Step Setup

### 1. Install Dependencies

```bash
# Frontend
cd frontend
npm install

# Backend
cd ../backend/functions
npm install
cd ../..
```

### 2. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (or use existing)
3. Enable these services:
   - **Authentication** → Sign-in method → Email/Password (Enable)
   - **Firestore Database** → Create database → Start in test mode (we'll deploy rules)
   - **Storage** → Get started → Start in test mode (we'll deploy rules)
   - **Functions** → Get started

4. Get your Firebase config:
   - Project Settings → General → Your apps → Web app
   - Copy the config object

5. Update `frontend/src/firebase/config.js` with your config

### 3. Initialize Firebase CLI

```bash
firebase login
firebase init
```

Select:
- ✅ Firestore
- ✅ Functions
- ✅ Storage
- Use existing project → Select your project

### 4. Deploy Security Rules

```bash
firebase deploy --only firestore:rules,storage
```

### 5. Deploy Cloud Functions

```bash
firebase deploy --only functions
```

### 6. Create First Admin User

After deploying functions, you can create an admin user:

1. Sign up through the app (any role)
2. In Firebase Console → Authentication → Users → Find your user
3. Note the UID
4. In Firebase Console → Functions → Logs, or use Firebase CLI:

```bash
# Call the setUserRole function via Firebase CLI or create a script
# Or manually set custom claims in Firebase Console
```

Or create a script to set admin role:

```javascript
// scripts/setAdmin.js
const admin = require('firebase-admin');
const serviceAccount = require('./path-to-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function setAdmin(uid) {
  await admin.auth().setCustomUserClaims(uid, { role: 'admin' });
  console.log(`Admin role set for ${uid}`);
}

// Call with user UID
setAdmin('user-uid-here');
```

### 7. Run Development Server

```bash
# Terminal 1: Frontend
cd frontend
npm run dev

# Terminal 2: Firebase Emulators (optional, for local testing)
firebase emulators:start
```

## Testing the Setup

1. Open `http://localhost:5173`
2. Click "Sign up"
3. Create an account (select Tenant, Landlord, or Contractor)
4. You should be redirected to your role-specific dashboard

## Troubleshooting

### "Permission denied" errors
- Make sure Firestore rules are deployed: `firebase deploy --only firestore:rules`
- Check that your user has the correct role in custom claims

### Functions not working
- Make sure functions are deployed: `firebase deploy --only functions`
- Check function logs: `firebase functions:log`

### Images not uploading
- Check Storage rules are deployed: `firebase deploy --only storage`
- Verify file size is under 5MB
- Check browser console for errors

### Chat not working
- Verify Firestore rules allow read/write to rooms collection
- Check that chat room was created when maintenance request was created
- Look for errors in browser console

## Next Steps

- Create test properties and link them to landlords/tenants
- Test the full flow: Create request → Assign contractor → Chat → Complete
- Set up production deployment
- Add more features from the README

