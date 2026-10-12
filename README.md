# 🩸 WE DONATE — Emergency Blood Donation & Blood Camp Management Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-red.svg)](./LICENSE)
[![Platform: Android](https://img.shields.io/badge/Platform-Android%20%7C%20Web-blue.svg)](https://reactnative.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0-green.svg)](https://nodejs.org/)
[![Database: MongoDB](https://img.shields.io/badge/Database-MongoDB%20Atlas%202dsphere-brightgreen.svg)](https://www.mongodb.com/)
[![Tests](https://img.shields.io/badge/Tests-11%20Suites%20%7C%2097%20Passed-success.svg)](./docs/testing.md)

> **WE DONATE** is an open-source, social-impact healthcare technology platform designed to eliminate fatal delays in emergency blood procurement. By combining real-time geospatial matching, Red Blood Cell compatibility intelligence, WhatsApp OTP verification, community donation drives, and hospital inventory tracking, WE DONATE bridges the critical gap between emergency patients and eligible nearby blood donors.

---

## 📑 Table of Contents

- [Problem Statement & Social Impact](#-problem-statement--social-impact)
- [Target Users](#-target-users)
- [Implemented Features](#-implemented-features)
- [Technology Stack](#-technology-stack)
- [System Requirements](#-system-requirements)
- [Repository Structure](#-repository-structure)
- [Environment Configuration](#-environment-configuration)
- [Local Installation & Setup](#-local-installation--setup)
  - [Backend Setup](#1-backend-setup)
  - [Mobile App Setup](#2-mobile-app-setup)
  - [Static Web Portals](#3-management-portals)
- [WhatsApp Cloud API Setup](#-whatsapp-cloud-api-setup)
- [MongoDB & Firebase Configuration](#-mongodb--firebase-configuration)
- [API Documentation](#-api-documentation)
- [Running Automated Tests](#-running-automated-tests)
- [Building the Android APK](#-building-the-android-apk)
- [Sample Data](#-sample-data)
- [Architecture & Diagrams](#-architecture--diagrams)
- [Troubleshooting](#-troubleshooting)
- [Security & Privacy](#-security--privacy)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Problem Statement & Social Impact

### The Crisis
In acute clinical scenarios—such as trauma accidents, postpartum hemorrhages, pediatric cancer transfusions, and major surgeries—every second counts. Traditional blood procurement often relies on fragmented social media appeals, physical family donor searches, or outdated paper lists. Critical blood units frequently spoil in one facility while another hospital kilometers away faces stockouts of the same group.

### The Social Impact
WE DONATE tackles this challenge with a unified, digital response:
1. **Zero-Latency Matching:** Dispatches alerts directly to medically compatible donors within a localized geographic radius (default 10 km) via WhatsApp and native push notifications.
2. **Medical Safety Verification:** Enforces a strict 90-day cooldown between donations, standard donor age limits (18–65 years), and RBC compatibility logic (e.g. Universal Donor `O-` and Universal Recipient `AB+`).
3. **Equitable Community Engagement:** Enables blood banks and NGOs to organize structured blood donation camps and allows patients to crowdfund costly repeated component therapies.

---

## 👥 Target Users

| Persona | Primary Needs & Interfaces |
| :--- | :--- |
| **Citizens & Voluntary Donors** | Mobile application (Android / Web). Profile management, real-time availability toggle, incoming emergency request response, interactive nearby donor map, camp registration. |
| **Emergency Requesters & Patients** | Mobile app / Web portal. Quick emergency blood request submission with GPS hospital location, live donor response tracking. |
| **Hospital Staff & Managers** | Web Management Portal (`/portal/hospital`). Verification of clinical requests, coordination of donor arrivals, inventory requisition. |
| **Blood Bank Officers** | Web Management Portal (`/portal/blood-bank`). Real-time blood inventory tracking, stock adjustments, camp collection records. |
| **Camp Organizers & NGOs** | Blood camp drive creation, venue scheduling, volunteer attendee check-in. |
| **Platform Administrators** | Super Admin Portal (`/portal/admin`). Platform metrics, audit logs, user management, and system configuration. |

---

## ✨ Implemented Features

### 1. WhatsApp OTP & Firebase Authentication
- **Real WhatsApp OTP Dispatch:** Outbound delivery of cryptographically secure 6-digit verification codes using Meta WhatsApp Cloud API (`Graph API v20.0`).
- **Resend Cooldown & Attempt Limits:** Enforces a 60-second request cooldown (HTTP 429) and a strict 5-attempt threshold per active OTP.
- **SHA-256 OTP Hashing:** Plaintext OTP codes are never logged or stored; only one-way SHA-256 hashes are persisted with a 10-minute TTL index.
- **Dual-Token JWT Security:** Short-lived access tokens (30 minutes) and rotating refresh tokens (30 days) with database token reuse protection.
- **Firebase Auth Bridge:** Cryptographic validation of Firebase Phone ID tokens for Android native devices.

### 2. Geospatial Donor Matching Engine
- **RBC Compatibility Matrix:** Calculates medical donor-to-recipient compatibility for all 8 blood groups (`A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`).
- **MongoDB 2dsphere Queries:** Geospatial `$geoWithin` discovery within configurable radiuses.
- **Haversine Distance Sorting:** Ranks candidates nearest-first.
- **Notification Waves:** Batches donor alerts (5 per wave) with a 10-minute escalation window handled by an automated background worker.

### 3. Emergency Blood Requests & Lifecycle
- Request submission with hospital name, units required (1–10), urgency levels (`CRITICAL`, `URGENT`, `HIGH`, `NORMAL`), and GPS coordinates.
- Prevention of duplicate active requests from the same user.
- Lifecycle tracking: `OPEN` → `MATCHING` → `DONOR_RESPONDED` → `DONOR_CONFIRMED` → `FULFILLED` / `CANCELLED`.

### 4. Blood Donation Camps & Community Drives
- Creation and scheduling of public blood camps with location coordinates and capacity limits.
- Citizen registration and volunteer check-in workflows.
- Post-camp collection logging across blood groups.

### 5. Medical Crowdfunding & Financial Support
- Public campaign feed for emergency patient care and thalassemia support.
- Real-time progress percentage and remaining amount virtual calculations.
- Idempotent donation recording.

### 6. In-App Mobile Versioning & Updates
- Backend version endpoint (`GET /api/v1/app/version`) exposing latest version, minimum supported version, and APK download URLs.
- In-app update modal with optional vs. mandatory update enforcement.

---

## 🛠 Technology Stack

### Mobile Client (Android & Web)
- **Framework:** React Native `0.76.7` with Expo SDK `52`
- **Language:** TypeScript `5.3.3`
- **State Management:** Zustand `5.0.3`
- **Navigation:** Custom React Native navigation router
- **Native Modules:** `expo-location`, `expo-notifications`, `expo-secure-store`, `react-native-maps`
- **Firebase Client:** `@react-native-firebase/app`, `@react-native-firebase/auth`

### Backend Services & API
- **Runtime:** Node.js `>=20.0.0`
- **Framework:** Express.js `4.21.2`
- **Database ODM:** Mongoose `8.7.0`
- **Security:** Helmet `8.0.0`, Express-Mongo-Sanitize `2.2.0`, Express-Rate-Limit `7.4.0`
- **Authentication:** JSON Web Tokens (`jsonwebtoken` `9.0.2`), `bcryptjs` `3.0.3`, Firebase Admin SDK `13.0.0`
- **Logging:** Winston `3.16.0` piped with Morgan `1.10.0`
- **Testing:** Jest `29.7.0`, Supertest `7.0.0`

### Persistence & Cloud Services
- **Database:** MongoDB Atlas (with `2dsphere` geospatial and TTL indexes)
- **Messaging:** Meta WhatsApp Cloud API (Graph API)
- **Push Alerts:** Firebase Cloud Messaging (FCM)
- **Maps:** Google Maps Platform (Android SDK & Geocoding)

---

## 💻 System Requirements

- **Node.js:** Version 20.x or higher LTS
- **Package Manager:** npm 10+
- **MongoDB:** MongoDB Atlas cluster or local MongoDB instance (>= 6.0) with geospatial index support
- **Mobile Development (Optional):**
  - Android Studio with Android SDK 34+ (for local Android emulation / APK builds)
  - Expo CLI (`npx expo`)
  - EAS CLI (`npm install -g eas-cli`)

---

## 📁 Repository Structure

```
WeDonateApp/
├── android/                   # Native Android wrapper & Gradle build configurations
├── assets/                    # App icons, splash screens, and adaptive assets
├── backend/                   # Node.js & Express REST API
│   ├── config/                # Database, Firebase, and version configurations
│   ├── controllers/           # API controllers (auth, request, match, camp, etc.)
│   ├── middleware/            # Security, JWT auth, rate limiter, and error handlers
│   ├── models/                # Mongoose database schemas with indexes
│   ├── portal/                # Unified HTML5/JS web portals (admin, hospital, blood-bank)
│   ├── routes/                # Express API routes
│   ├── services/              # Core business services (matching, OTP, WhatsApp, FCM)
│   ├── tests/                 # 11 automated Jest test suites
│   ├── utils/                 # Blood compatibility, distance, and logger utilities
│   ├── .env.example           # Backend environment variable template
│   ├── package.json           # Backend dependencies and test scripts
│   └── server.js              # Express server initialization and background worker
├── docs/                      # Technical documentation
│   ├── architecture.md        # Architecture design & Mermaid diagrams
│   └── testing.md             # Test plan, cases, and execution report
├── sample-data/               # Realistic, 100% fictional test records
│   ├── donors.json            # 8 sample donors across all blood groups
│   ├── blood-requests.json    # 3 sample emergency requests
│   ├── blood-camps.json       # 2 sample donation drives
│   ├── campaigns.json         # 2 sample crowdfunding campaigns
│   ├── import-sample-data.js  # Safe automated database seeder
│   └── README.md              # Sample data usage instructions
├── src/                       # React Native Expo Mobile App
│   ├── components/            # Reusable UI widgets and update modals
│   ├── navigation/            # App screens router
│   ├── screens/               # Auth, Home, Requests, Camps, Donor, and Map screens
│   ├── services/              # Client API connectors & update services
│   ├── store/                 # Zustand state stores
│   ├── theme/                 # Design tokens and color palettes
│   └── types/                 # TypeScript type definitions
├── .env.example               # Root mobile environment template
├── app.json                   # Expo application metadata & permissions
├── LICENSE                    # Standard open-source MIT License
└── package.json               # Mobile app dependencies and scripts
```

---

## ⚙️ Environment Configuration

### Backend Environment Variables (`backend/.env`)

Copy `backend/.env.example` to `backend/.env`:
```bash
cp backend/.env.example backend/.env
```

| Variable | Description | Required | Safe Placeholder / Default |
| :--- | :--- | :---: | :--- |
| `NODE_ENV` | Runtime environment (`development`, `test`, `production`) | No | `development` |
| `PORT` | HTTP server port | No | `5000` |
| `API_VERSION` | API route version string | No | `v1` |
| `ALLOWED_ORIGINS` | Comma-separated CORS whitelist | No | `http://localhost:3000,http://localhost:5000,http://localhost:8081` |
| `MONGODB_URI` | MongoDB connection string (local or Atlas) | **Yes** | `mongodb://127.0.0.1:27017/wedonate` |
| `JWT_ACCESS_SECRET` | 64-char hex key for signing access tokens | **Yes** | *(Generate via `crypto.randomBytes(32).toString('hex')`)* |
| `JWT_REFRESH_SECRET` | 64-char hex key for signing refresh tokens | **Yes** | *(Generate via `crypto.randomBytes(32).toString('hex')`)* |
| `JWT_ACCESS_EXPIRY` | Access token lifetime | No | `30m` |
| `JWT_REFRESH_EXPIRY`| Refresh token lifetime | No | `30d` |
| `WHATSAPP_ENABLED` | Master switch for WhatsApp services | No | `true` |
| `WHATSAPP_PROVIDER`| WhatsApp gateway provider | No | `META_CLOUD_API` |
| `META_ACCESS_TOKEN`| Meta System User Permanent Access Token | Optional in dev | `EAA_PLACEHOLDER_META_TOKEN` |
| `META_PHONE_NUMBER_ID`| Meta WhatsApp Cloud Phone Number ID | Optional in dev | `100000000000001` |
| `META_WABA_ID` | WhatsApp Business Account ID | No | `100000000000002` |
| `META_OTP_TEMPLATE_NAME`| Approved Meta authentication template | No | `wedonate_otp` |
| `FIREBASE_PROJECT_ID`| Firebase project identifier | Optional in dev | `we-donate-demo` |
| `FIREBASE_CLIENT_EMAIL`| Service account client email | Optional in dev | `firebase-adminsdk-demo@we-donate-demo.iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY`| Service account private key PEM | Optional in dev | `"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"` |
| `DEFAULT_MATCHING_RADIUS_KM`| Radius for donor matching in km | No | `10` |
| `RATE_LIMIT_MAX_REQUESTS`| Max HTTP requests per IP per window | No | `100` |

### Mobile App Environment Variables (`.env`)

Copy `.env.example` to `.env` in the root directory:
```bash
cp .env.example .env
```

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `EXPO_PUBLIC_API_URL` | Backend API base URL | `http://10.0.2.2:5000` (Android Emulator) / `http://localhost:5000` |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps Android SDK Key | `AIzaSy_YOUR_GOOGLE_MAPS_KEY` |

---

## 🚀 Local Installation & Setup

### 1. Backend Setup

```bash
# 1. Navigate to backend directory
cd backend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your MongoDB URI and random JWT secrets

# 4. Start backend in development mode (with hot reload)
npm run dev

# Or start in standard mode
npm start
```
Verify the server is running by opening: `http://localhost:5000/api/health`.

### 2. Mobile App Setup

```bash
# 1. From the repository root, install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Start Expo development server
npm start
```
From the interactive Expo CLI:
- Press `a` to open on a connected Android device or emulator.
- Press `w` to open in your web browser.

### 3. Management Portals

The backend automatically hosts lightweight, unified management portals:
- **Portal Hub:** `http://localhost:5000/portal`
- **Super Admin Dashboard:** `http://localhost:5000/portal/admin`
- **Hospital Management:** `http://localhost:5000/portal/hospital`
- **Blood Bank Stock Portal:** `http://localhost:5000/portal/blood-bank`

---

## 💬 WhatsApp Cloud API Setup

WE DONATE implements native integration with the **Meta WhatsApp Cloud API (Graph API v20.0)** for fast, reliable OTP authentication and emergency broadcasts.

1. **Create a Meta Developer Account:** Visit [developers.facebook.com](https://developers.facebook.com) and create an app with the **Business** type.
2. **Add WhatsApp Product:** Select WhatsApp from the dashboard to create a WhatsApp Business Account (WABA).
3. **Create an Authentication Template:**
   - In WhatsApp Manager, create a template named `wedonate_otp` under category **Authentication**.
   - Language: `English (US)` (`en`).
   - Add a 1-variable body parameter: `{{1}} is your verification code for WE DONATE.`
   - Add a **Copy Code** button or URL button.
4. **Generate Permanent Access Token:** Create a System User in Meta Business Suite with `whatsapp_business_messaging` and `whatsapp_business_management` permissions.
5. **Configure Backend:** Add `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, and `META_WABA_ID` to your backend `.env`.
6. **Development / Test Mode:** When running in test mode (`NODE_ENV=test`) or when `META_ACCESS_TOKEN` is omitted, the backend automatically logs dispatches to the console and simulates OTP approval without network errors.

---

## 🗄 MongoDB & Firebase Configuration

### MongoDB Setup
1. Create a free Mongoose/MongoDB cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) or start a local MongoDB service.
2. Ensure your user has read/write privileges on the database (e.g. `wedonate`).
3. Set `MONGODB_URI` in `backend/.env`.
4. Geospatial `2dsphere` indexes on `location` fields in `User`, `BloodRequest`, and `DonationCamp` are created automatically when Mongoose initializes.

### Firebase Setup
1. Create a project in [Firebase Console](https://console.firebase.google.com).
2. Enable **Authentication** with Phone Provider.
3. Download `google-services.json` and place it in `android/app/google-services.json` (refer to [`docs/google-services.json.example`](./docs/google-services.json.example)).
4. Under Project Settings → Service Accounts, generate a new private key JSON and populate `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` in `backend/.env`.

---

## 📡 API Documentation

All routes are prefixed with `/api/v1` (except the root `/api/health`).

### Health
- `GET /api/health` — Public server status, MongoDB connection status, and uptime.

### Authentication (`/api/v1/auth`)
- `POST /send-otp` — Request 6-digit WhatsApp OTP (`phone`, `purpose: "LOGIN"|"REGISTER"`).
- `POST /verify-otp` — Verify OTP code and receive `{ accessToken, refreshToken, user }`.
- `GET /whatsapp-status` — Public diagnostic endpoint returning active WhatsApp template and connection status without secrets.
- `POST /phone-login` — Direct phone authentication for citizen registration.
- `POST /firebase-login` — Authenticate using Firebase ID Token (`Authorization: Bearer <id_token>`).
- `POST /refresh` — Rotate refresh token and issue new token pair.
- `POST /logout` — Revoke active refresh token.
- `POST /admin-login` — Password authentication for hospital, blood bank, and admin portal users.

### Emergency Blood Requests (`/api/v1/blood-requests`)
- `POST /` — Create an emergency blood request (`patientName`, `bloodGroup`, `unitsRequired`, `urgency`, `hospitalName`, `hospitalLatitude`, `hospitalLongitude`).
- `GET /` — List open blood requests.
- `GET /my` — List requests submitted by authenticated user.
- `GET /available` — List unfilled emergency requests within specified GPS radius (`?latitude=&longitude=&radius=`).
- `GET /:id` — Get full blood request details.
- `POST /:id/cancel` — Cancel an open request (owner only).

### Donor Matching (`/api/v1/matches`)
- `POST /:requestId/assign` — Trigger geospatial matching engine to discover and notify eligible nearby donors.
- `POST /:matchId/accept` — Matched donor accepts request (updates status and shares hospital routing).
- `POST /:matchId/reject` — Matched donor declines request with optional reason.
- `GET /my-matches` — List incoming and active match assignments for authenticated donor.

### Blood Camps (`/api/v1/camps`)
- `GET /` — List scheduled blood donation drives.
- `POST /` — Create a new blood donation camp (Authorized roles).
- `POST /:id/register` — Citizen registers as an attendee for an upcoming camp.
- `GET /:id/registrations` — View registered donor roster for a camp.
- `PATCH /registrations/:registrationId/check-in` — Check in an attendee at the camp venue.
- `POST /:id/results` — Record final collected units per blood group.

### Medical Crowdfunding (`/api/v1/funding`)
- `GET /` — List active medical crowdfunding campaigns.
- `GET /:id` — Get campaign details and contribution history.
- `POST /donate` — Record a financial contribution toward a campaign.
- `GET /my-donations` — List user's historical contributions.

### App Updates (`/api/v1/app`)
- `GET /version` — Public metadata endpoint returning latest version, minimum required version, APK download link, and release notes.

---

## 🧪 Running Automated Tests

The repository includes a comprehensive, verified test suite covering all critical logic:

```bash
# 1. Run all backend test suites
cd backend
npm test

# 2. Run with coverage report
npm run test:coverage

# 3. Run mobile TypeScript validation
cd ..
npx tsc --noEmit
```

**Verification Results:**
- **Backend Test Suites:** 11 passed, 11 total
- **Backend Tests:** 97 passed, 97 total
- **Mobile TypeScript:** 0 errors
- For full test breakdown, review [`docs/testing.md`](./docs/testing.md).

---

## 📦 Building the Android APK

To build a standalone production or preview Android APK:

### Using EAS Build (Cloud)
```bash
# 1. Install EAS CLI and login
npm install -g eas-cli
eas login

# 2. Build Android APK
eas build -p android --profile preview
```

### Local Android Build via Gradle
```bash
# 1. Generate native Android project (if needed)
npx expo prebuild --platform android

# 2. Build release APK locally
cd android
./gradlew assembleRelease

# The generated APK will be at:
# android/app/build/outputs/apk/release/app-release.apk
```

---

## 📊 Sample Data

The project provides realistic, completely fictional sample records for judges and developers to test all features locally without real user data.

- Donors covering all 8 blood groups: [`sample-data/donors.json`](./sample-data/donors.json)
- Emergency blood requests: [`sample-data/blood-requests.json`](./sample-data/blood-requests.json)
- Blood donation camps: [`sample-data/blood-camps.json`](./sample-data/blood-camps.json)
- Crowdfunding campaigns: [`sample-data/campaigns.json`](./sample-data/campaigns.json)

**Safe Import (with dry-run):**
```bash
# Validate structure without writing:
node sample-data/import-sample-data.js --dry-run

# Import into local database:
node sample-data/import-sample-data.js --db-uri=mongodb://127.0.0.1:27017/wedonate_dev
```
*Full instructions in [`sample-data/README.md`](./sample-data/README.md).*

---

## 📐 Architecture & Diagrams

Comprehensive system diagrams and schema specifications are documented in [`docs/architecture.md`](./docs/architecture.md), including:
1. High-Level System Architecture Diagram
2. WhatsApp OTP Sequence Flow
3. Emergency Blood Request & Geospatial Donor Matching Workflow
4. Entity Relationship Diagram (ERD)

---

## 🔧 Troubleshooting

1. **`MongoDB not connected` error on `GET /api/health`:**
   - Verify that your local MongoDB daemon is running or that your MongoDB Atlas IP Access List includes your current IP address (`0.0.0.0/0` for development).
2. **`UnauthorizedAccess` on Windows running `npm`:**
   - PowerShell script execution policies can block `.ps1` wrappers. Run commands using `npm.cmd test` or `npx.cmd <command>`.
3. **WhatsApp OTP not received on mobile device:**
   - If using Meta test phone numbers, ensure the destination number is added to your **To** test phone number list in the Meta App Dashboard.
   - In development, inspect server logs: the backend logs simulated dispatch codes when live credentials are not set.
4. **Android emulator cannot connect to `http://localhost:5000`:**
   - Use `http://10.0.2.2:5000` inside Android emulators, as `localhost` refers to the emulator itself.

---

## 🔒 Security & Privacy

- **Zero Secret Commits:** `.gitignore` excludes `.env`, `google-services.json`, private keys, keystores, and build outputs.
- **Data Protection:** Real donor phone numbers and personal health information are protected with role-based authorization and display masking.
- **Input Sanitization:** NoSQL query injection attacks are mitigated using `express-mongo-sanitize`.
- **Brute-Force Protection:** Rate limiting via `express-rate-limit` throttles brute-force attempts on authentication and OTP endpoints.

---

## 🤝 Contributing

Contributions are welcome!
1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/amazing-feature`).
3. Run tests before committing: `cd backend && npm test` and `npx tsc --noEmit`.
4. Commit your changes (`git commit -m 'feat: add amazing feature'`).
5. Push to the branch (`git push origin feature/amazing-feature`).
6. Open a Pull Request.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.
