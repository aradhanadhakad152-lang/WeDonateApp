#!/usr/bin/env node
'use strict';

/**
 * ============================================================================
 * WE DONATE — Safe Sample Data Importer
 * ============================================================================
 * Loads realistic, 100% fictional sample records into MongoDB for local testing,
 * hackathon demonstrations, and development environments.
 *
 * SAFETY GUARDS:
 * 1. Strictly refuses to run on production databases unless explicitly overridden
 *    with --allow-production.
 * 2. Uses dedicated fictional sample ObjectIds and phone numbers (+9199990000XX).
 * 3. Never overwrites or purges real donor data.
 *
 * Usage:
 *   node sample-data/import-sample-data.js
 *   node sample-data/import-sample-data.js --dry-run
 *   node sample-data/import-sample-data.js --db-uri=mongodb://localhost:27017/wedonate_dev
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

// Resolve dependencies from backend/node_modules if not in root
const backendNodeModules = path.join(__dirname, '..', 'backend', 'node_modules');
if (fs.existsSync(backendNodeModules)) {
  module.paths.push(backendNodeModules);
}

const mongoose = require(path.join(backendNodeModules, 'mongoose'));
const dotenv = require(path.join(backendNodeModules, 'dotenv'));
dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });

const User = require('../backend/models/User');
const BloodRequest = require('../backend/models/BloodRequest');
const DonationCamp = require('../backend/models/DonationCamp');
const FundingCampaign = require('../backend/models/FundingCampaign');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    allowProduction: args.includes('--allow-production'),
    uri: null,
  };

  const uriArg = args.find((a) => a.startsWith('--db-uri='));
  if (uriArg) {
    options.uri = uriArg.split('=')[1];
  }
  return options;
};

const run = async () => {
  const options = parseArgs();
  const mongoUri = options.uri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wedonate_dev';

  console.log('=================================================================');
  console.log('  WE DONATE — Sample Data Importer');
  console.log('=================================================================');
  console.log(`Target MongoDB URI: ${mongoUri.replace(/:([^@]+)@/, ':****@')}`);
  console.log(`Dry Run:            ${options.dryRun ? 'YES (No changes will be saved)' : 'NO'}`);

  // Safety check: protect production
  const isLikelyProduction =
    mongoUri.includes('production') ||
    mongoUri.includes('prod') ||
    (process.env.NODE_ENV === 'production' && !mongoUri.includes('localhost') && !mongoUri.includes('127.0.0.1'));

  if (isLikelyProduction && !options.allowProduction) {
    console.error('\n[SAFETY ABORT] Refusing to run on what appears to be a production database!');
    console.error('If you really intended this, rerun with the --allow-production flag.');
    process.exit(1);
  }

  // Read sample files
  const donorsFile = path.join(__dirname, 'donors.json');
  const requestsFile = path.join(__dirname, 'blood-requests.json');
  const campsFile = path.join(__dirname, 'blood-camps.json');
  const campaignsFile = path.join(__dirname, 'campaigns.json');

  const donors = JSON.parse(fs.readFileSync(donorsFile, 'utf8'));
  const requests = JSON.parse(fs.readFileSync(requestsFile, 'utf8'));
  const camps = JSON.parse(fs.readFileSync(campsFile, 'utf8'));
  const campaigns = JSON.parse(fs.readFileSync(campaignsFile, 'utf8'));

  console.log(`\nDiscovered records to seed:`);
  console.log(`  - Fictional Donors:        ${donors.length}`);
  console.log(`  - Emergency Requests:      ${requests.length}`);
  console.log(`  - Blood Camps:             ${camps.length}`);
  console.log(`  - Crowdfunding Campaigns:  ${campaigns.length}`);

  if (options.dryRun) {
    console.log('\n[DRY RUN COMPLETE] Validation succeeded. No writes executed.');
    process.exit(0);
  }

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('\nConnected to MongoDB successfully.');

    // 1. Seed Donors (upsert by phone)
    console.log('Importing sample donors...');
    for (const donor of donors) {
      await User.findOneAndUpdate(
        { phone: donor.phone },
        { $set: donor },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    console.log(`  ✓ Successfully upserted ${donors.length} donors.`);

    // 2. Seed Blood Requests (upsert by _id)
    console.log('Importing sample blood requests...');
    for (const req of requests) {
      await BloodRequest.findOneAndUpdate(
        { _id: req._id },
        { $set: req },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    console.log(`  ✓ Successfully upserted ${requests.length} emergency blood requests.`);

    // 3. Seed Camps (upsert by _id)
    console.log('Importing sample blood donation camps...');
    for (const camp of camps) {
      await DonationCamp.findOneAndUpdate(
        { _id: camp._id },
        { $set: camp },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    console.log(`  ✓ Successfully upserted ${camps.length} blood donation camps.`);

    // 4. Seed Campaigns (upsert by _id)
    console.log('Importing sample funding campaigns...');
    for (const cmp of campaigns) {
      await FundingCampaign.findOneAndUpdate(
        { _id: cmp._id },
        { $set: cmp },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    console.log(`  ✓ Successfully upserted ${campaigns.length} funding campaigns.`);

    console.log('\n=================================================================');
    console.log('  Sample data import completed successfully!');
    console.log('=================================================================\n');
  } catch (err) {
    console.error(`\n[IMPORT FAILED] ${err.message}`);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('MongoDB connection closed.');
    }
  }
};

run();
