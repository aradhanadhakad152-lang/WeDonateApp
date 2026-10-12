# WE DONATE — Technical Architecture & System Design Document

This document provides a comprehensive technical architectural specification of the **WE DONATE** emergency blood donor matching, blood camp drive, and medical crowdfunding platform.

---

## 1. System Architecture Overview

WE DONATE is an open-source, social-impact healthcare technology platform designed to bridge the life-critical gap between emergency patients requiring blood and nearby compatible, voluntary donors. The system coordinates citizens, hospital administrators, blood bank officers, and camp organizers in real time.

```mermaid
flowchart TD
    subgraph Clients["Client Tier"]
        MobileApp["Mobile App (Expo React Native / Android APK)"]
        AdminPortal["Super Admin & Portal Hub (HTML5 / Vanilla JS)"]
        HospitalPortal["Hospital & Blood Bank Portals"]
    end

    subgraph Gateway["API & Security Layer"]
        ExpressAPI["Node.js / Express REST API (v1)"]
        Helmet["Helmet Security Headers & CSP"]
        RateLimiter["express-rate-limit (Sliding Window)"]
        MongoSanitize["express-mongo-sanitize (NoSQL Injection Guard)"]
        JWTMiddleware["JWT Authentication & RBAC Middleware"]
    end

    subgraph CoreServices["Backend Application Core"]
        AuthSvc["Auth & OTP Service"]
        MatchingEngine["Geospatial Donor Matching Engine"]
        EligibilitySvc["Donor Eligibility Service (90-Day Cooldown)"]
        CampSvc["Blood Camp & Drive Manager"]
        FundingSvc["Medical Crowdfunding Controller"]
        BatchWorker["Notification Escalation Batch Worker (60s loop)"]
    end

    subgraph DataStorage["Persistence Tier"]
        MongoDB[("MongoDB Atlas (2dsphere Geospatial Indexing)")]
    end

    subgraph ExternalServices["External Cloud & Telephony Services"]
        MetaWA["Meta WhatsApp Cloud API (Graph API v20.0)"]
        FirebaseAdmin["Firebase Admin SDK (FCM & Phone Auth)"]
        GoogleMaps["Google Maps Platform (Geocoding & Matrix API)"]
        RazorpayGateway["Razorpay Payment Gateway (Test/Live)"]
    end

    MobileApp -->|HTTPS REST| ExpressAPI
    AdminPortal -->|HTTPS REST| ExpressAPI
    HospitalPortal -->|HTTPS REST| ExpressAPI

    ExpressAPI --> Helmet
    Helmet --> RateLimiter
    RateLimiter --> MongoSanitize
    MongoSanitize --> JWTMiddleware

    JWTMiddleware --> AuthSvc
    JWTMiddleware --> MatchingEngine
    JWTMiddleware --> EligibilitySvc
    JWTMiddleware --> CampSvc
    JWTMiddleware --> FundingSvc
    BatchWorker -.->|Periodic Poll| MatchingEngine

    AuthSvc --> MongoDB
    MatchingEngine --> MongoDB
    EligibilitySvc --> MongoDB
    CampSvc --> MongoDB
    FundingSvc --> MongoDB

    AuthSvc -->|OTP Templates| MetaWA
    AuthSvc -->|Token Verification| FirebaseAdmin
    MatchingEngine -->|Push Dispatch| FirebaseAdmin
    MatchingEngine -->|Emergency Alert| MetaWA
    FundingSvc -->|Webhooks / Orders| RazorpayGateway
    MobileApp -->|Display Maps| GoogleMaps
```

---

## 2. Component Responsibilities

### 2.1 Mobile Application (`src/`)
* **Technology:** React Native (0.76.7) with Expo SDK 52, TypeScript, Zustand state management.
* **Responsibilities:**
  - Citizen onboarding via phone number input and WhatsApp OTP verification.
  - Emergency blood request initiation with real-time GPS coordinate capture (`expo-location`).
  - Incoming request alerts with donor accept/reject controls (`IncomingBloodRequestScreen`).
  - Interactive map view of nearby compatible donors using `react-native-maps`.
  - Blood donation camp discovery and instant registration (`DonationCampsScreen`).
  - Medical crowdfunding exploration and contribution feed (`FundingScreen`).
  - Automatic in-app update notifications with version resolution and direct APK download (`AppUpdateModal`).
  - Offline-safe JWT token storage using `expo-secure-store`.

### 2.2 Backend API (`backend/`)
* **Technology:** Node.js (>=20.0), Express 4.21, Mongoose 8.7, Winston logging.
* **Responsibilities:**
  - RESTful API routing under `/api/v1/*` with strict input sanitization.
  - WhatsApp OTP dispatch and cryptographically secure hash validation (`otpService.js`).
  - Double-token authentication: short-lived access tokens (30 min) and rotating hashed refresh tokens (30 days).
  - Multi-portal static asset serving with cache control headers (`/portal/admin`, `/portal/hospital`, `/portal/blood-bank`).
  - Role-Based Access Control (`CITIZEN`, `HOSPITAL_STAFF`, `HOSPITAL_MANAGER`, `BLOOD_BANK_MANAGER`, `CAMP_ORGANIZER`, `ADMIN`, `SUPER_ADMIN`).
  - Asynchronous background worker (`notificationCampaignService.js`) running every 60 seconds to escalate unfilled emergency requests to secondary donor tiers.

### 2.3 Database Tier (MongoDB Atlas)
* **Storage Model:** MongoDB with Mongoose ODM schemas.
* **Key Capabilities:**
  - Geospatial discovery utilizing `2dsphere` indexes on user and hospital coordinates.
  - TTL (Time-To-Live) automatic index expiration for OTP verification tokens (`expires: 0`).
  - Unique compound constraints preventing duplicate donor match assignments and duplicate camp registrations.

---

## 3. Core Interaction & Sequence Flows

### 3.1 WhatsApp OTP Authentication Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User as Citizen User (Mobile App)
    participant Client as WeDonate Mobile Client
    participant API as Express Auth Controller
    participant OTP as OTP Service
    participant DB as MongoDB (OtpVerification)
    participant Meta as Meta WhatsApp Cloud API

    User->>Client: Enters mobile number (e.g. 9876543210)
    Client->>API: POST /api/v1/auth/send-otp { phone, purpose: "LOGIN" }
    API->>OTP: normalizePhone(phone) -> +919876543210
    API->>DB: Check 60-second resend cooldown
    alt Within 60 seconds cooldown
        DB-->>API: Active OTP record exists (< 60s old)
        API-->>Client: 429 Too Many Requests (Wait 60s)
    else Cooldown cleared
        API->>DB: Invalidate previous active OTPs for this phone
        API->>OTP: generate6DigitCode() -> random integer (100000-999999)
        API->>OTP: hashOTP(code) -> SHA-256 Hex Digest
        API->>DB: Create OtpVerification record (otpHash, expiresAt: 10m, attempts: 0)
        API->>OTP: sendOTPViaWhatsApp(phone, code)
        OTP->>Meta: POST /v20.0/{phone_number_id}/messages (Template: wedonate_otp)
        Meta-->>User: WhatsApp message delivered with 6-digit OTP code
        OTP-->>API: WhatsApp message dispatched (messageId)
        API-->>Client: 200 OK { phone, resendCooldown: 60, expiresIn: 600 }
    end

    User->>Client: Enters 6-digit OTP code
    Client->>API: POST /api/v1/auth/verify-otp { phone, otp, purpose: "LOGIN" }
    API->>DB: Find active OTP record for phone
    alt OTP record expired or not found
        API-->>Client: 400 Bad Request (Code expired or not found)
    else Record found and attempts < 5
        API->>OTP: hashOTP(otp)
        alt Hash matches stored otpHash
            API->>DB: Mark verifiedAt = now()
            API->>DB: Upsert User profile (CITIZEN, ACTIVE)
            API->>API: generateTokenPair(user) (Access Token + Refresh Token)
            API->>DB: Save SHA-256 hash of refresh token
            API-->>Client: 200 OK { user, tokens: { accessToken, refreshToken } }
            Client->>Client: Save tokens in SecureStore & navigate to HomeScreen
        else Hash mismatch
            API->>DB: Increment attempts (attempts + 1)
            API-->>Client: 400 Bad Request (Invalid code, N attempts remaining)
        end
    else Attempts >= 5
        API-->>Client: 429 Too Many Requests (Max attempts exceeded)
    end
```

---

### 3.2 Emergency Blood Request & Geospatial Donor Matching Flow

```mermaid
sequenceDiagram
    autonumber
    actor Requester as Patient / Hospital Requester
    participant Client as WeDonate App / Portal
    participant API as Request & Match Controller
    participant Matcher as Donor Matching Engine
    participant DB as MongoDB Atlas (2dsphere)
    participant FCM as Firebase Cloud Messaging
    participant WhatsApp as Meta WhatsApp Cloud API
    actor Donor as Matched Nearby Donor

    Requester->>Client: Submits emergency request (Patient, Blood Group, Units, Hospital GPS)
    Client->>API: POST /api/v1/blood-requests (Bearer Token)
    API->>DB: Verify requester has no duplicate active request
    API->>DB: Create BloodRequest (Status: OPEN, GeoJSON coordinates)
    API->>Matcher: Trigger findAndMatchNearbyDonors(requestId, radiusKm: 10)

    Matcher->>Matcher: Calculate compatible RBC blood groups (e.g. O- -> [O-])
    Matcher->>DB: Geospatial Query: $geoWithin / $centerSphere (within 10km radius)
    Note over Matcher,DB: Filters: isDonor=true, donorStatus=AVAILABLE, isEligible=true
    DB-->>Matcher: List of eligible donor candidate documents

    Matcher->>Matcher: Calculate exact Haversine distance and sort nearest-first
    Matcher->>DB: Create DonorMatch records (status: PENDING, unique index guard)
    Matcher->>Matcher: Partition candidates into Batch 1 (top 5 donors)

    par Push Notification
        Matcher->>FCM: Send High-Priority Emergency Notification
        FCM-->>Donor: Native device push alert ("Emergency O- needed 2.4 km away")
    and WhatsApp Notification (if configured)
        Matcher->>WhatsApp: Dispatch emergency alert template
        WhatsApp-->>Donor: WhatsApp emergency message with hospital details
    end

    Donor->>Client: Opens alert -> Views hospital location & distance
    Donor->>API: POST /api/v1/matches/{matchId}/accept (Bearer Token)
    API->>DB: Update DonorMatch status -> ACCEPTED
    API->>DB: Update BloodRequest status -> DONOR_CONFIRMED
    API->>FCM: Notify Requester ("A donor has confirmed and is en route!")
    API-->>Donor: 200 OK (Hospital navigation routes & contact info provided)
```

---

## 4. Database Models & Schema Relationships

```mermaid
erDiagram
    User ||--o{ BloodRequest : "requests"
    User ||--o{ DonorMatch : "donates_as_donor"
    User ||--o{ DonorMatch : "receives_as_requester"
    User ||--o{ CampRegistration : "registers_for"
    User ||--o{ FinancialDonation : "contributes"
    Organization ||--o{ DonationCamp : "organizes"
    Organization ||--o{ BloodInventory : "maintains"
    BloodRequest ||--o{ DonorMatch : "matches_with"
    DonationCamp ||--o{ CampRegistration : "enrolls"
    FundingCampaign ||--o{ FinancialDonation : "receives_funds"

    User {
        ObjectId _id PK
        string firebaseUid UK
        string phone UK
        string fullName
        string bloodGroup
        string role
        string accountStatus
        boolean isDonor
        boolean isAvailable
        boolean isEligible
        date lastDonationDate
        GeoJSONPoint location "2dsphere index"
        array refreshTokenHashes
        string deviceToken
    }

    BloodRequest {
        ObjectId _id PK
        ObjectId requesterId FK
        string patientName
        string bloodGroup
        number unitsRequired
        string urgency
        string status
        string hospitalName
        number hospitalLatitude
        number hospitalLongitude
        GeoJSONPoint location "2dsphere index"
        date requiredBy
    }

    DonorMatch {
        ObjectId _id PK
        ObjectId bloodRequest FK
        ObjectId donor FK
        ObjectId requester FK
        string donorBloodGroup
        number distanceKm
        GeoJSONPoint donorLocation
        string status
        date matchedAt
        date respondedAt
    }

    DonationCamp {
        ObjectId _id PK
        ObjectId organizationId FK
        string title
        date date
        string address
        string city
        GeoJSONPoint location "2dsphere index"
        array supportedBloodGroups
        number registrationLimit
        number registeredCount
        string status
    }

    CampRegistration {
        ObjectId _id PK
        ObjectId campId FK
        ObjectId userId FK
        string bloodGroup
        string status
        number unitsDonated
        string donationNumber
    }

    FundingCampaign {
        ObjectId _id PK
        string title
        string patientName
        string hospitalName
        number targetAmount
        number raisedAmount
        string category
        string status
        number donorCount
    }

    FinancialDonation {
        ObjectId _id PK
        string receiptNumber UK
        ObjectId campaignId FK
        ObjectId donorId FK
        number amount
        string paymentStatus
    }

    BloodInventory {
        ObjectId _id PK
        ObjectId organizationId FK
        string bloodGroup
        number availableUnits
        number reservedUnits
        number lowStockThreshold
    }
```

---

## 5. Security, Privacy & Failure Handling

### 5.1 Privacy & Data Protection
* **Phone Number Masking:** Mobile phone numbers are masked in logs, diagnostics, and notifications (`+91 98XXX XX210`).
* **Cryptographic OTP Hashes:** Plaintext OTP codes are never written to database collections, stored in log streams, or exposed in API payloads. Only one-way SHA-256 hashes are persisted with short 10-minute TTL expiration.
* **Token Security:** Raw refresh tokens are never persisted in the database; only SHA-256 digests are stored, enabling secure rotation and immediate revocation upon compromised reuse detection.

### 5.2 Fault Tolerance & Failure Handling
* **Meta WhatsApp Fallback:** If Meta WhatsApp Cloud API credentials are unset, disabled, or encounter rate limits, the system records errors without crashing and gracefully falls back to FCM push notification dispatch.
* **Geospatial Resiliency:** In the absence of live donor coordinates or GPS permission denial on client devices, users are guided through explicit location settings without crashing background processes.
* **Database Connection Auto-Healing:** MongoDB connections utilize reconnect retry logic with server selection timeouts, and health endpoints report degraded states (`503 Service Unavailable`) rather than terminating the Express process.
