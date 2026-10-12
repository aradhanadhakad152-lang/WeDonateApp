# Sample Data for WE DONATE

This directory provides realistic, 100% fictional test records for evaluating and developing the **WE DONATE** emergency platform locally and during hackathon judging.

> [!IMPORTANT]
> **Privacy & Integrity Guarantee:**
> - None of these records correspond to real individuals, patients, hospitals, or contact details.
> - Phone numbers use non-routable fictional patterns (`+9199990000XX`).
> - Coordinates are set in standard test regions (Delhi NCR) to validate MongoDB `2dsphere` geospatial indexing and Haversine distance calculations.
> - The importer strictly prevents inadvertent execution against production databases.

---

## Files Overview

| File | Description | Schema Alignment |
| :--- | :--- | :--- |
| [`donors.json`](./donors.json) | 8 fictional donors covering every blood group (`A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`), with active donor availability and recent donation dates. | `backend/models/User.js` |
| [`blood-requests.json`](./blood-requests.json) | 3 emergency patient requests across `CRITICAL`, `URGENT`, and `HIGH` urgency levels with hospital GeoJSON points. | `backend/models/BloodRequest.js` |
| [`blood-camps.json`](./blood-camps.json) | 2 blood donation drives with registration caps, dates, venues, and organizer contacts. | `backend/models/DonationCamp.js` |
| [`campaigns.json`](./campaigns.json) | 2 medical crowdfunding campaigns for pediatric oncology transfusions and thalassemia logistic funds. | `backend/models/FundingCampaign.js` |
| [`import-sample-data.js`](./import-sample-data.js) | Safe Node.js seed script with dry-run support, upsert idempotency, and production safeguards. | — |

---

## Safe Import Instructions

### 1. Validate JSON Format (Dry Run)

Test the files and schema structure without writing anything to the database:

```bash
node sample-data/import-sample-data.js --dry-run
```

### 2. Import into a Local Development Database

To seed a local MongoDB instance (e.g. `mongodb://localhost:27017/wedonate_dev`):

```bash
node sample-data/import-sample-data.js --db-uri=mongodb://127.0.0.1:27017/wedonate_dev
```

### 3. Safety Controls

The script checks `process.env.MONGODB_URI` and `process.env.NODE_ENV`. If the target URI contains `production` or `prod`, execution will immediately abort unless explicitly invoked with:

```bash
node sample-data/import-sample-data.js --allow-production
```

All operations use `findOneAndUpdate` with `{ upsert: true }`, meaning re-running the script is idempotent and will never create duplicate documents or purge unmanaged collections.
