# Virtual Tour Creation App

A comprehensive virtual tour creation platform with authentication, project management, and real-time editing capabilities.

## 🚀 Features

### Authentication System
- **Sign In / Sign Up** with email and password
- **Social Login** support (Google, Apple)
- **Demo Account**: `demo@virtualtour.com` / `demo123`
- **Persistent Sessions** with localStorage

### Project Management
- **Home Dashboard** with project grid
- **Search Projects** functionality
- **Project Status** (Draft/Published)
- **Quick Stats** (scenes, hotspots)

### Virtual Tour Editor
- **360° Panorama** viewer
- **Interactive Hotspots** (navigation & info)
- **PNG Overlays** with drag & drop
- **Real-time Canvas** rendering
- **Text-to-Speech** for info hotspots
- **Share Functionality** with system dialogs

### Sharing System
- **System Share Dialog** (Web Share API)
- **Clipboard Fallback** for unsupported browsers
- **View-Only Mode** for shared tours
- **Real-time Updates** (when implemented with backend)

## 🏗️ Architecture

```
src/
├── components/
│   ├── SignIn.js          # Sign In component
│   ├── SignUp.js          # Sign Up component
│   ├── Home.js            # Home dashboard
│   └── Auth.css           # Authentication styles
├── views/
│   └── VirtualTourApp.js  # Main tour editor
├── services/
│   └── share-service.js   # Sharing service (optional)
└── App.js                 # Main routing component
```

## 🎯 User Flow

### 1. Authentication
- User lands on Sign In page
- Can sign up or use demo account
- Persistent session after login

### 2. Home Dashboard
- View all projects in grid layout
- Search and filter projects
- Create new project or open existing

### 3. Project Creation
- **Start from Scratch**: Blank canvas
- **Use Template**: Pre-designed layouts
- **Import Existing**: From images/360° photos

### 4. Tour Editor
- Add 360° panorama images
- Place interactive hotspots
- Add PNG overlays and items
- Configure navigation between scenes
- Real-time preview

### 5. Sharing
- Click share button for system dialog
- Viewers get read-only access
- Updates reflect when refreshed

## 🔧 Technical Implementation

### State Management
- Component-level state with React
- localStorage for persistence
- Session management

### Key Components
- **App.js**: Main routing and state
- **VirtualTourApp.js**: Core editor functionality
- **Home.js**: Project management interface

### Data Flow
```
User Input → Component State → localStorage → UI Updates
     ↓
Share API → URL Generation → Cross-device Access
```

## 🎨 Design System

### Colors
- Primary: `#667eea` (Blue gradient)
- Secondary: `#764ba2` (Purple gradient)
- Success: `#10b981` (Green)
- Warning: `#f59e0b` (Orange)
- Error: `#ef4444` (Red)

### Typography
- Font: Inter (system fallback)
- Weights: 400, 500, 600, 700
- Sizes: 13px - 28px

### Components
- **Cards**: Rounded corners, subtle shadows
- **Buttons**: Gradient backgrounds, hover effects
- **Forms**: Clean, accessible design
- **Modals**: Backdrop blur, smooth transitions

## 📱 Responsive Design

- **Mobile**: 320px+ optimized
- **Tablet**: 768px+ adapted
- **Desktop**: 1024px+ full experience

## 🔐 Security Notes

- Demo credentials for testing
- No real backend (localStorage only)
- Client-side state management
- Safe for development/demo use

## 🚀 Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm start
   