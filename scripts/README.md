# Scripts

Helper scripts for managing the Repairo platform.

## createUser.js

**Create users with roles (hardcode user logins)**

Creates a new user account with a specific role. This is the recommended way to hardcode user logins for testing.

### Prerequisites

1. Get your Firebase service account key:
   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate new private key"
   - Save as `serviceAccountKey.json` in this folder

2. Install dependencies (if not already installed):
   ```bash
   cd scripts
   npm install
   ```

### Usage

```bash
# Basic usage (landlord, contractor, admin)
node scripts/createUser.js <email> <password> <role>

# For tenants (with property and landlord)
node scripts/createUser.js <email> <password> tenant <propertyId> <landlordId>
```

### Examples

```bash
# Create a landlord
node scripts/createUser.js landlord@example.com password123 landlord

# Create a tenant with property and landlord
node scripts/createUser.js tenant@example.com password123 tenant prop-001 landlord-uid-123

# Create a contractor
node scripts/createUser.js contractor@example.com password123 contractor

# Create an admin
node scripts/createUser.js admin@example.com password123 admin
```

**Note**: Users created with this script can immediately log in with the provided email and password. The role is automatically set in custom claims and stored in Firestore.

## setUserRole.js

Sets or updates the role for an existing user by email.

### Usage

```bash
node scripts/setUserRole.js <user-email> <role>
```

**Note**: The user must sign out and sign in again for the role change to take effect (custom claims are cached in the ID token).

## createMockData.js

**Create mock data (tenants and contractors)**

Creates 5 mock tenants and 3 mock contractors for testing. All users have the default password "password123".

### Usage

```bash
node scripts/createMockData.js <landlord-email>
```

### Example

```bash
# First create a landlord
node scripts/createUser.js landlord@example.com password123 landlord

# Then create mock data
node scripts/createMockData.js landlord@example.com
```

This will create:
- 5 tenants (tenant1@example.com through tenant5@example.com)
- 3 contractors (contractor1@example.com through contractor3@example.com)
- All linked to the specified landlord
- All with password: `password123`

## setUserRole.js

Sets or updates the role for an existing user by email.

### Usage

```bash
node scripts/setUserRole.js <user-email> <role>
```

**Note**: The user must sign out and sign in again for the role change to take effect (custom claims are cached in the ID token).

## setAdminRole.js

Sets the admin role for a user by email.

### Usage

```bash
node scripts/setAdminRole.js user@example.com
```

**Note**: The user must sign out and sign in again for the role change to take effect (custom claims are cached in the ID token).

## Future Scripts

- `seedData.js` - Seed test data (users, properties, requests)
- `migrateData.js` - Data migration utilities
- `backupData.js` - Backup Firestore data

