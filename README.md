# Repairo - Maintenance Management Platform

A comprehensive web platform for managing maintenance requests between tenants, landlords, and contractors. Built with React.js, Firebase, and modern web technologies.

## Architecture

- **Frontend**: React.js with Vite, TailwindCSS
- **Backend**: Firebase Cloud Functions (Node.js)
- **Database**: Firebase Firestore
- **Authentication**: Firebase Authentication with Custom Claims (RBAC)
- **Storage**: Firebase Storage (for maintenance request images)
- **Real-time**: Firestore real-time listeners for chat

## Project Structure

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

### Running Locally

#### Frontend Development Server

```bash
cd frontend
npm run dev
```

The app will be available at `http://localhost:5173`


## Features

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

## System Security Rules

- Tenants can only read/write their own maintenance requests
- Contractors can only read assigned jobs
- Landlords can access requests for their properties
- Admins have full access
- Chat rooms are accessible only to members

## Documentation

- [Firebase Documentation]
- [React Router]
- [TailwindCSS]
- [Vite]

