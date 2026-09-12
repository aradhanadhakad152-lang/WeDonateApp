'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const ROLES = [
  'CITIZEN',
  'HOSPITAL_STAFF',
  'HOSPITAL_MANAGER',
  'BLOOD_BANK_MANAGER',
  'CAMP_ORGANIZER',
  'ADMIN',
  'SUPER_ADMIN',
];
const ACCOUNT_STATUSES = ['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'];
const DONOR_STATUSES = ['AVAILABLE', 'UNAVAILABLE', 'INELIGIBLE'];
const GENDERS = ['MALE', 'FEMALE', 'OTHER'];

/**
 * User Model — Production Grade Multi-Portal RBAC
 */
const userSchema = new mongoose.Schema(
  {
    // Firebase identity link
    firebaseUid: {
      type: String,
      required: [true, 'Firebase UID is required'],
      unique: true,
      index: true,
    },

    // Contact
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
      match: [/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format (e.g. +919876543210)'],
    },

    // Profile Info
    fullName: {
      type: String,
      trim: true,
      maxlength: [100, 'Full name cannot exceed 100 characters'],
      default: null,
    },
    name: {
      type: String,
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
      default: null,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
      sparse: true,
    },
    password: {
      type: String,
      select: false,
      minlength: [8, 'Password must be at least 8 characters'],
    },
    profilePhoto: {
      type: String,
      default: null,
    },
    gender: {
      type: String,
      enum: {
        values: GENDERS,
        message: 'Gender must be MALE, FEMALE, or OTHER',
      },
      default: null,
    },
    age: {
      type: Number,
      min: [18, 'Minimum donor age is 18'],
      max: [65, 'Maximum donor age is 65'],
      default: null,
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },

    // Donation & Blood Info
    bloodGroup: {
      type: String,
      enum: {
        values: BLOOD_GROUPS,
        message: `Blood group must be one of: ${BLOOD_GROUPS.join(', ')}`,
      },
      default: null,
    },
    isDonor: {
      type: Boolean,
      default: true,
    },
    donorStatus: {
      type: String,
      enum: {
        values: DONOR_STATUSES,
        message: `Donor status must be one of: ${DONOR_STATUSES.join(', ')}`,
      },
      default: 'AVAILABLE',
    },
    lastDonationDate: {
      type: Date,
      default: null,
    },
    nextEligibleDonationDate: {
      type: Date,
      default: null,
    },
    isEligible: {
      type: Boolean,
      default: true,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },

    // Location (GeoJSON Point + Structured Address)
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude] — GeoJSON standard order
        default: [0, 0],
      },
      address: { type: String, trim: true, default: '' },
      city: { type: String, trim: true, default: '' },
      state: { type: String, trim: true, default: '' },
      pincode: { type: String, trim: true, default: '' },
      accuracy: { type: Number, default: null },
      updatedAt: { type: Date, default: null },
    },

    // Notifications
    deviceToken: {
      type: String,
      default: null,
    },
    deviceTokens: [
      {
        type: String,
      },
    ],

    // Account Status & Authorization
    role: {
      type: String,
      enum: {
        values: ROLES,
        message: `Role must be one of: ${ROLES.join(', ')}`,
      },
      default: 'CITIZEN',
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    accountStatus: {
      type: String,
      enum: {
        values: ACCOUNT_STATUSES,
        message: `Account status must be one of: ${ACCOUNT_STATUSES.join(', ')}`,
      },
      default: 'ACTIVE',
    },
    isVerified: {
      type: Boolean,
      default: true,
    },

    // Audit
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lastLogin: {
      type: Date,
      default: null,
    },

    // Security: SHA-256 Hashes of active Refresh Tokens
    refreshTokenHashes: [
      {
        hash: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, required: true },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
userSchema.index({ 'location': '2dsphere' });
userSchema.index({ bloodGroup: 1, isEligible: 1, isAvailable: 1, accountStatus: 1, isActive: 1 });
userSchema.index({ role: 1, accountStatus: 1 });

// Virtuals
userSchema.virtual('isProfileComplete').get(function () {
  const nameVal = this.fullName || this.name;
  const hasName = !!(nameVal && nameVal.trim().length > 0);
  const hasBlood = !!this.bloodGroup;
  const hasLoc = !!(this.location && (this.location.city || (Array.isArray(this.location.coordinates) && (this.location.coordinates[0] !== 0 || this.location.coordinates[1] !== 0))));
  return hasName && hasBlood && hasLoc;
});

// Middleware
userSchema.pre('save', async function (next) {
  if (this.isModified('password') && this.password) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }

  if (this.fullName && !this.name) {
    this.name = this.fullName;
  } else if (this.name && !this.fullName) {
    this.fullName = this.name;
  }

  if (this.lastDonationDate) {
    const nextDate = new Date(this.lastDonationDate);
    nextDate.setDate(nextDate.getDate() + 90);
    this.nextEligibleDonationDate = nextDate;

    if (new Date() < nextDate) {
      this.isEligible = false;
      this.donorStatus = 'INELIGIBLE';
    } else if (this.donorStatus === 'INELIGIBLE') {
      this.isEligible = true;
      this.donorStatus = 'AVAILABLE';
    }
  }

  if (this.accountStatus === 'SUSPENDED') {
    this.isActive = false;
  } else if (this.accountStatus === 'ACTIVE') {
    this.isActive = true;
  }

  next();
});

// Methods
userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password || !enteredPassword) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};
userSchema.methods.toPublicJSON = function () {
  const nameVal = this.fullName || this.name;
  return {
    id: this._id,
    name: nameVal,
    fullName: nameVal,
    bloodGroup: this.bloodGroup,
    isEligible: this.isEligible,
    isAvailable: this.isAvailable,
    isDonor: this.isDonor,
    donorStatus: this.donorStatus,
    role: this.role,
    isVerified: this.isVerified,
    location: {
      city: this.location?.city || '',
      state: this.location?.state || '',
      coordinates: this.location?.coordinates || [0, 0],
    },
  };
};

userSchema.methods.toProfileJSON = function () {
  const nameVal = this.fullName || this.name;
  return {
    id: this._id,
    firebaseUid: this.firebaseUid,
    phone: this.phone,
    name: nameVal,
    fullName: nameVal,
    email: this.email,
    profilePhoto: this.profilePhoto,
    gender: this.gender,
    age: this.age,
    dateOfBirth: this.dateOfBirth,
    bloodGroup: this.bloodGroup,
    isDonor: this.isDonor,
    donorStatus: this.donorStatus,
    lastDonationDate: this.lastDonationDate,
    nextEligibleDonationDate: this.nextEligibleDonationDate,
    isEligible: this.isEligible,
    isAvailable: this.isAvailable,
    location: {
      coordinates: this.location?.coordinates || [0, 0],
      address: this.location?.address || '',
      city: this.location?.city || '',
      state: this.location?.state || '',
      pincode: this.location?.pincode || '',
      accuracy: this.location?.accuracy || null,
      updatedAt: this.location?.updatedAt || null,
    },
    role: this.role,
    organizationId: this.organizationId || null,
    isActive: this.isActive,
    accountStatus: this.accountStatus,
    isVerified: this.isVerified,
    isProfileComplete: this.isProfileComplete,
    lastLogin: this.lastLogin,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const User = mongoose.model('User', userSchema);

module.exports = User;
