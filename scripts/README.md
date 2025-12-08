# Scripts

Helper scripts for managing the Repairo platform.

## setAdminRole.js

Sets the admin role for a user by email.

### Prerequisites

1. Get your Firebase service account key:
   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate new private key"
   - Save as `serviceAccountKey.json` in this folder

2. Install dependencies (if not already installed):
   ```bash
   cd backend/functions
   npm install
   ```

### Usage

```bash
node scripts/setAdminRole.js user@example.com
```

**Note**: The user must sign out and sign in again for the role change to take effect (custom claims are cached in the ID token).

## Future Scripts

- `seedData.js` - Seed test data (users, properties, requests)
- `migrateData.js` - Data migration utilities
- `backupData.js` - Backup Firestore data

