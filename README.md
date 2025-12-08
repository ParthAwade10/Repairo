# Repairo - Maintenance Management Platform

A comprehensive web platform for managing maintenance requests between tenants, landlords, and contractors. Built with React.js, Firebase, and modern web technologies.

## 🏗️ Architecture

- **Frontend**: React.js with Vite, TailwindCSS
- **Backend**: Firebase Cloud Functions (Node.js)
- **Database**: Firebase Firestore
- **Authentication**: Firebase Authentication with Custom Claims (RBAC)
- **Storage**: Firebase Storage (for maintenance request images)
- **Real-time**: Firestore real-time listeners for chat

## 📁 Project Structure

```
Repairo/
├── frontend/                 # React.js frontend application
│   ├── src/
│   │   ├── api/             # API functions (auth, maintenance, messaging)
│   │   ├── components/      # Reusable React components
│   │   ├── context/         # React Context (AuthContext)
│   │   ├── firebase/        # Firebase configuration
│   │   ├── pages/           # Page components (dashboards, login, etc.)
│   │   ├── App.jsx          # Main app component with routing
│   │   └── main.jsx         # Entry point
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── functions/           # Firebase Cloud Functions
│   │   ├── index.js         # Main functions file
│   │   └── package.json
│   ├── services/            # Backend service modules
│   │   └── auth.js          # Authentication helpers
│   └── utils/               # Utility functions
│       └── helpers.js
├── shared/
│   └── types/               # Shared type definitions
│       └── index.js
├── firestore.rules          # Firestore security rules
├── storage.rules            # Firebase Storage security rules
├── firestore.indexes.json   # Firestore composite indexes
├── firebase.json            # Firebase project configuration
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Firebase CLI: `npm install -g firebase-tools`
- A Firebase project (create at [Firebase Console](https://console.firebase.google.com))

### Initial Setup

1. **Clone and install dependencies:**

```bash
# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend/functions
npm install

# Return to root
cd ../..
```

2. **Firebase Configuration:**

   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com)
   - Enable Authentication (Email/Password)
   - Enable Firestore Database
   - Enable Storage
   - Get your Firebase config from Project Settings > General > Your apps

3. **Configure Firebase in frontend:**

   Edit `frontend/src/firebase/config.js` and replace the placeholder config:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};
```

4. **Initialize Firebase in your project:**

```bash
firebase login
firebase init
```

   Select:
   - Firestore
   - Functions
   - Storage
   - Use existing project (select your Firebase project)

5. **Deploy Firestore Rules and Indexes:**

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

6. **Deploy Cloud Functions:**

```bash
firebase deploy --only functions
```

### Running Locally

#### Frontend Development Server

```bash
cd frontend
npm run dev
```

The app will be available at `http://localhost:5173`

#### Firebase Emulators (for local testing)

```bash
# Start all emulators
firebase emulators:start

# Or start specific emulators
firebase emulators:start --only auth,firestore,functions,storage
```

The emulator UI will be available at `http://localhost:4000`

**Important**: When using emulators, update your Firebase config to point to emulators:

```javascript
// In frontend/src/firebase/config.js (for development)
import { connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator } from 'firebase/firestore';
import { connectStorageEmulator } from 'firebase/storage';

// After initializing Firebase
if (import.meta.env.DEV) {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectStorageEmulator(storage, 'localhost', 9199);
}
```

## 🔐 Authentication & RBAC

### User Roles

- **Tenant**: Can create maintenance requests, view their own requests, chat
- **Landlord**: Can view all requests for their properties, assign contractors, update status, chat
- **Contractor**: Can view assigned jobs, update progress, chat
- **Admin**: Full access to all features

### Role Assignment

Roles are stored in Firebase Custom Claims. When a user signs up, the `setUserRole` Cloud Function is called to assign their role.

**Helper Functions:**

- `createUserWithRole(email, password, role)` - Create user with role
- `getUserRole(uid)` - Get user's role
- `requireRole(['landlord'])` - Backend security check

### Protected Routes

Routes are protected using the `ProtectedRoute` component:

```jsx
<ProtectedRoute requiredRoles={['tenant']}>
  <CreateMaintenanceRequest />
</ProtectedRoute>
```

## 📋 Features

### 1. Maintenance Request System

- **Create**: Tenants can create requests with title, description, images, property ID
- **View**: Role-based viewing (tenants see their own, landlords see all for their properties)
- **Update**: Landlords can assign contractors and update status
- **Status Flow**: `open` → `in_progress` → `complete`

### 2. Real-time Messaging

- Automatic chat room creation when a maintenance request is created
- Members: Tenant, Landlord, and Contractor (when assigned)
- Real-time updates using Firestore `onSnapshot`
- Thread-based messaging similar to Slack

### 3. Role-Based Dashboards

- **Tenant Dashboard**: View requests, create new requests
- **Landlord Dashboard**: View all requests, assign contractors, manage status
- **Contractor Dashboard**: View assigned jobs, update progress
- **Admin Dashboard**: Full access (placeholder for future features)

## 🔒 Security Rules

### Firestore Rules

Located in `firestore.rules`:

- Tenants can only read/write their own maintenance requests
- Contractors can only read assigned jobs
- Landlords can access requests for their properties
- Admins have full access
- Chat rooms are accessible only to members

### Storage Rules

Located in `storage.rules`:

- Maintenance images: Readable by all authenticated users, writable by tenants and admins
- File size limit: 5MB for maintenance images
- Content type validation: Images only

## 📝 Next Steps

### 1. Deployment Setup

**Frontend Deployment (Vercel/Netlify):**

```bash
cd frontend
npm run build
# Deploy the 'dist' folder to your hosting service
```

**Backend Deployment:**

```bash
firebase deploy --only functions
```

**Environment Variables:**

Set up environment variables for production:
- Firebase config (already in code)
- Any API keys for future integrations

### 2. Local Emulator Setup

For full local development:

1. Update Firebase config to use emulators (see "Running Locally" section)
2. Start emulators: `firebase emulators:start`
3. Seed initial data (create test users, properties)

### 3. Extending RBAC

To add new roles or permissions:

1. **Add role to shared types** (`shared/types/index.js`):
```javascript
export const USER_ROLES = {
  // ... existing roles
  MANAGER: 'manager',
};
```

2. **Update Firestore rules** (`firestore.rules`):
```javascript
function hasRole(role) {
  return getUserRole() == role || getUserRole() == 'manager';
}
```

3. **Update Cloud Functions** (`backend/functions/index.js`):
```javascript
const validRoles = ['tenant', 'landlord', 'contractor', 'admin', 'manager'];
```

4. **Update frontend** (`frontend/src/context/AuthContext.jsx`):
   - Add role checks in components
   - Update ProtectedRoute usage

### 4. Adding AI Troubleshooting

To integrate AI-powered troubleshooting:

1. **Create Cloud Function** for AI analysis:
```javascript
exports.analyzeMaintenanceRequest = functions.https.onCall(async (data, context) => {
  const { requestId, description } = data;
  
  // Call AI service (OpenAI, etc.)
  const aiResponse = await callAIService(description);
  
  // Store suggestions in Firestore
  await admin.firestore()
    .collection('maintenanceRequests')
    .doc(requestId)
    .update({ aiSuggestions: aiResponse });
  
  return { suggestions: aiResponse };
});
```

2. **Add UI Component** for AI suggestions:
   - Create `frontend/src/components/AISuggestions.jsx`
   - Display suggestions on maintenance request detail page
   - Allow users to apply suggestions

3. **Add API function** (`frontend/src/api/maintenance.js`):
```javascript
export const getAISuggestions = async (requestId, description) => {
  const analyzeRequest = httpsCallable(functions, 'analyzeMaintenanceRequest');
  const result = await analyzeRequest({ requestId, description });
  return result.data;
};
```

### 5. Additional Features to Consider

- **Property Management**: Add properties collection with landlord-tenant relationships
- **Notifications**: Firebase Cloud Messaging for real-time notifications
- **File Attachments**: Expand beyond images to PDFs, documents
- **Status History**: Track status changes over time
- **Rating System**: Allow tenants to rate contractors
- **Calendar Integration**: Schedule maintenance appointments
- **Email Notifications**: Send emails on status changes
- **Mobile App**: React Native version using same backend

## 🛠️ Development

### Code Organization

- **API Layer**: All Firebase interactions in `frontend/src/api/`
- **Components**: Reusable UI components in `frontend/src/components/`
- **Pages**: Full page components in `frontend/src/pages/`
- **Context**: Global state management (Auth) in `frontend/src/context/`
- **Backend Services**: Reusable backend logic in `backend/services/`

### Best Practices

1. **Security**: Always validate on both client and server
2. **Error Handling**: Use try-catch blocks and user-friendly error messages
3. **Loading States**: Show loading indicators during async operations
4. **Type Safety**: Consider migrating to TypeScript for better type safety
5. **Testing**: Add unit tests for critical functions (auth, RBAC)

## 📚 Documentation

- [Firebase Documentation](https://firebase.google.com/docs)
- [React Router](https://reactrouter.com/)
- [TailwindCSS](https://tailwindcss.com/)
- [Vite](https://vitejs.dev/)

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly (especially security rules)
4. Submit a pull request

## 📄 License

[License Here]

---

**Built with ❤️ for property management**