# WE DONATE — Testing Strategy, Plan & Verification Report

This document defines the comprehensive test plan, execution procedures, and actual automated verification results for the **WE DONATE** emergency blood donation and camp management platform.

---

## 1. Test Environment & Verification Summary

| Component | Framework / Tool | Command | Suites | Tests | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Backend API & Services** | Jest (Node.js) + Supertest | `npm test` (inside `backend/`) | 11 Passed / 11 Total | 97 Passed / 97 Total | ✅ **PASSED** (Ran on 2026-10-12) |
| **Mobile App (Frontend)** | TypeScript Static Analysis | `npx tsc --noEmit` (at root) | 1 Typecheck Run | Clean (0 errors) | ✅ **PASSED** (Ran on 2026-10-12) |
| **Sample Data Importer** | Node.js dry-run validator | `node sample-data/import-sample-data.js --dry-run` | 1 Validation Run | 4 datasets verified | ✅ **PASSED** (Ran on 2026-10-12) |

---

## 2. Test Execution Instructions

### A. Run Backend Automated Test Suite
From the repository root:
```bash
cd backend
npm test
```
*Note on Windows PowerShell:* If PowerShell script execution policies block `npm.ps1`, invoke via `npm.cmd test`.

To run tests with code coverage reporting:
```bash
npm run test:coverage
```

### B. Run Mobile App TypeScript Validation
From the repository root:
```bash
npx tsc --noEmit
```

### C. Run Isolated Single Test File
```bash
cd backend
npx jest tests/otpVerificationFlow.test.js
npx jest tests/eligibilityAndCamp.test.js
```

---

## 3. Automated Test Suites Breakdown

### Suite 1: Phone Validation & WhatsApp OTP Lifecycle (`tests/otpVerificationFlow.test.js`)
* **Phone Normalization (`normalizePhone`):**
  - E.164 standardization: Converts standard 10-digit Indian numbers (`9876543210`) to `+919876543210`.
  - Prefix handling: Normalizes 12-digit numbers starting with `91` to `+919876543210`.
  - Non-destructive: Retains existing valid international prefixes (e.g. `+14155552671`).
  - Formatting cleansing: Strips hyphens, brackets, and extraneous spaces (`+91 98765-43210`).
  - Null/undefined safety: Safely returns empty string for empty inputs without throwing errors.
* **OTP Generation & Security:**
  - Secure random generation: Generates 6-digit numeric values strictly within `100000` to `999999`.
  - Cryptographic one-way hashing: Validates deterministic SHA-256 generation; verifies plaintexts are never exposed.
* **Cooldown & Attempt Limits:**
  - Cooldown window enforcement: Rejects duplicate OTP generation within 60 seconds with HTTP 429.
  - Expiration detection: Identifies expired OTP records after the 10-minute TTL.
  - Maximum attempts enforcement: Increments attempt count upon failed entry and enforces hard block at 5 attempts (HTTP 429).
  - Validation: Authenticates valid SHA-256 match while rejecting mismatched codes.

### Suite 2: Blood Compatibility, Donor Eligibility & Camps (`tests/eligibilityAndCamp.test.js`)
* **Red Blood Cell (RBC) Compatibility Matrix:**
  - Complete mapping for all 8 ABO/Rh types (`A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`).
  - Universal Donor: Verifies `O-` can donate to all 8 blood groups.
  - Universal Recipient: Verifies `AB+` can receive from all 8 blood groups.
  - Rh factor constraints: Confirms Rh+ donors cannot donate to Rh- recipients.
* **Donation Interval & Eligibility Service (`checkEligibility`):**
  - Minimum 90-day interval (`DONATION_INTERVAL_DAYS = 90`).
  - Rejection of donors whose last donation was within 90 days, returning next eligible date.
  - Approval of donors whose last donation was >= 90 days ago.
  - Age restriction boundary tests: Rejects age < 18 and > 65; allows ages 18 through 65.
  - Account suspension checks: Rejects donors with `SUSPENDED` account status.
* **Blood Camp Registration:**
  - Enforces registration limit checks against `registeredCount >= registrationLimit`.
* **API Error Handling:**
  - Verifies 404 response payload structure for unrecognized routes.
  - Verifies 401 response for unauthenticated calls to protected routes.
  - Verifies 400 response with descriptive errors for invalid phone format.

### Suite 3: Emergency Blood Request Workflow (`tests/request.test.js`)
* Requester authentication verification (401 when token missing).
* Request creation validation: blood group, units required (1-10 range), urgency enum.
* Hospital geolocation requirement (GeoJSON coordinates required).
* Prevention of concurrent duplicate active blood requests by the same citizen.
* Cancellation workflow: Requester can cancel open request; non-owners are rejected.
* Radius-based available request discovery.

### Suite 4: Donor Matching & Geospatial Engine (`tests/match.test.js`)
* Geospatial `2dsphere` discovery of compatible donors within default 10 km radius.
* Nearest-first ranking via Haversine distance calculations.
* Duplicate match prevention via compound unique index `{ bloodRequest: 1, donor: 1 }`.
* Match acceptance workflow: Donor accepts match, updates request state to `DONOR_RESPONDED` / `DONOR_CONFIRMED`.

### Suite 5: GPS Location & Spatial Queries (`tests/location.test.js`)
* Updates live user GPS coordinates via `PUT /api/v1/users/me/location`.
* Discovery of nearby active donors via `GET /api/v1/users/nearby` with coordinate radius and blood group filtering.

### Suite 6: Notification Campaign & Dispatch (`tests/notification.test.js`)
* Multi-channel dispatch orchestration (FCM Push, WhatsApp Cloud API, SMS gateway).
* Batch creation with escalation window (default 10 minutes).
* Notification status tracking (`UNREAD`, `READ`).

### Suite 7: Authentication & Token Rotation (`tests/auth.test.js`)
* Firebase ID Token cryptographic verification (mocked test token vs live SDK).
* Issuance of short-lived Access Token (30m) and long-lived Refresh Token (30d).
* Token rotation and refresh token reuse detection with revocation.
* Protected profile query (`GET /api/v1/users/me`).

### Suite 8: WhatsApp Cloud API & Template Formatting (`tests/whatsapp.test.js`)
* Formats emergency alert messages with bold markdown fields.
* Rejects malformed recipient telephone numbers.
* Graceful fallback when `WHATSAPP_ENABLED=false`.

### Suite 9: Crowdfunding & Financial Donations (`tests/funding.test.js`)
* Retrieves public medical funding campaigns.
* Calculates progress percentage and remaining funding targets.
* Rejects unauthenticated donation submissions with 401.

### Suite 10: Health Check (`tests/health.test.js`)
* Returns 200 OK with server uptime, environment, and MongoDB connection status.
* Returns 503 Service Unavailable when database disconnects.

### Suite 11: User Profile Management (`tests/user.test.js`)
* Profile retrieval and update endpoints.
* Account deactivation and soft suspension checks.

---

## 4. External Services Mocking Strategy

To guarantee that unit and integration test runs are deterministic, fast, and secure:

1. **Meta WhatsApp Cloud API:**
   - In `test` environment (`NODE_ENV=test`), `sendOTPViaWhatsApp` detects when live `META_ACCESS_TOKEN` is unset or mocked and returns `{ success: true, provider: 'MOCK' }` without making real outbound HTTP calls or consuming Meta quotas.
2. **Firebase Admin SDK:**
   - Unit tests mock `verifyIdToken` to accept predefined test tokens (`VALID_MOCK_FIREBASE_ID_TOKEN`) and reject invalid tokens (`INVALID_FIREBASE_TOKEN`).
3. **SMS & Push Notifications:**
   - Notification dispatches check `SMS_ENABLED` and `WHATSAPP_ENABLED`, skipping external network requests during test execution while asserting internal event recording.
4. **MongoDB:**
   - Tests connect to the local/configured MongoDB database or test URI with short socket timeouts (2000-3000ms), ensuring tests never hang if connectivity drops.
