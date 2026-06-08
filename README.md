# Casso Inventory System

A modern inventory management application built with React, TypeScript, and Firebase.

## ✨ Features

- 👥 User authentication and role-based access control (Admin/User)
- 📦 Material management and tracking
- 📋 Request management system
- 📊 Analytics and reporting
- 🔐 **Device Approval System** - Gmail notifications for new device logins

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Firebase project (already configured)

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## 🔐 Device Approval System

New in this version: **Device Approval Feature**

When users login from a new device, they receive a Gmail notification and must approve the device before access is granted. This adds an extra security layer to protect user accounts.

### Quick Setup

1. **Set Gmail credentials** (required once):
   ```bash
   firebase functions:config:set gmail.email="your-email@gmail.com" gmail.password="your-app-password"
   ```

2. **Deploy Cloud Functions**:
   ```bash
   firebase deploy --only functions
   ```

For detailed setup instructions, see [DEVICE_APPROVAL_SETUP.md](./DEVICE_APPROVAL_SETUP.md)

## 📁 Project Structure

```
src/
├── auth/              # Authentication pages and components
├── main/              # Main dashboard and features
├── components/        # Reusable components
├── lib/               # Utilities and Firebase config
└── guest/             # Guest page
```

## 🔧 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## 📞 Support

For issues with the device approval system, refer to the troubleshooting section in [DEVICE_APPROVAL_SETUP.md](./DEVICE_APPROVAL_SETUP.md)
