'use strict';

const User = require('../models/User');
const Organization = require('../models/Organization');
const BloodRequest = require('../models/BloodRequest');
const DonationCamp = require('../models/DonationCamp');
const CampRegistration = require('../models/CampRegistration');
const DonationRegistration = require('../models/DonationRegistration');
const DonorMatch = require('../models/DonorMatch');
const BloodInventory = require('../models/BloodInventory');
const FinancialDonation = require('../models/FinancialDonation');
const FundingCampaign = require('../models/FundingCampaign');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');
const axios = require('axios');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

// GET /api/v1/admin/dashboard — Real-Time Platform Analytics
const getAdminDashboardMetrics = asyncHandler(async (req, res) => {
  const totalUsers = await User.countDocuments();
  const totalDonors = await User.countDocuments({ isDonor: true });
  const activeDonors = await User.countDocuments({ isDonor: true, isAvailable: true, accountStatus: 'ACTIVE' });

  const totalHospitals = await Organization.countDocuments({ type: 'HOSPITAL' });
  const totalBloodBanks = await Organization.countDocuments({ type: 'BLOOD_BANK' });
  const pendingOrgVerifications = await Organization.countDocuments({ status: 'PENDING_VERIFICATION' });

  const totalBloodRequests = await BloodRequest.countDocuments();
  const pendingRequestVerifications = await BloodRequest.countDocuments({ status: 'VERIFICATION_PENDING' });
  const verifiedRequests = await BloodRequest.countDocuments({ status: { $in: ['HOSPITAL_VERIFIED', 'ADMIN_VERIFIED', 'MATCHING'] } });
  const fulfilledRequests = await BloodRequest.countDocuments({ status: 'FULFILLED' });
  const expiredRequests = await BloodRequest.countDocuments({ status: 'EXPIRED' });

  const activeCamps = await DonationCamp.countDocuments({ status: { $in: ['PUBLISHED', 'ONGOING'] } });
  const totalCampRegistrations = await CampRegistration.countDocuments();

  const fundingAggregation = await FinancialDonation.aggregate([
    { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
  ]);
  const totalDonationFunding = fundingAggregation.length > 0 ? fundingAggregation[0].totalAmount : 0;
  const totalCampaigns = await FundingCampaign.countDocuments();

  const recentAuditActivity = await AuditLog.find()
    .populate('performedBy', 'fullName name role email')
    .sort({ createdAt: -1 })
    .limit(10)
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Admin dashboard metrics retrieved successfully',
    data: {
      metrics: {
        totalUsers,
        totalDonors,
        activeDonors,
        totalHospitals,
        totalBloodBanks,
        pendingOrgVerifications,
        totalBloodRequests,
        pendingRequestVerifications,
        verifiedRequests,
        fulfilledRequests,
        expiredRequests,
        activeCamps,
        totalCampRegistrations,
        totalDonationFunding,
        totalCampaigns,
      },
      recentActivity: recentAuditActivity,
    },
  });
});

// GET /api/v1/admin/users — List Users & Donors for Operational Admin View
const getUsersList = asyncHandler(async (req, res) => {
  const { role, isDonor, bloodGroup, status, city } = req.query;
  const filter = {};
  if (role) filter.role = role;
  if (isDonor !== undefined) filter.isDonor = isDonor === 'true';
  if (bloodGroup) filter.bloodGroup = bloodGroup;
  if (status) filter.accountStatus = status;
  if (city) filter['location.city'] = new RegExp(city, 'i');

  const users = await User.find(filter)
    .select('-refreshTokenHashes -password')
    .sort({ createdAt: -1 })
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${users.length} user record(s)`,
    data: { users },
  });
});

// PATCH /api/v1/admin/users/:id/status — Activate / Deactivate User Account
const updateUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { accountStatus, reason } = req.body;
  const adminUser = req.user;

  if (!['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'].includes(accountStatus)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Account status must be ACTIVE, SUSPENDED, or PENDING_VERIFICATION',
    });
  }

  const userDoc = await User.findById(id);
  if (!userDoc) {
    return sendError(res, {
      statusCode: 404,
      message: 'User account not found',
    });
  }

  const previousState = userDoc.accountStatus;
  userDoc.accountStatus = accountStatus;
  userDoc.isActive = accountStatus === 'ACTIVE';

  await userDoc.save();

  // Audit Log
  await AuditLog.create({
    performedBy: adminUser._id,
    userRole: adminUser.role,
    action: 'USER_STATUS_CHANGED',
    entityType: 'User',
    entityId: userDoc._id.toString(),
    previousState: { accountStatus: previousState },
    newState: { accountStatus },
    reason: reason || `Admin updated account status to ${accountStatus}`,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: `User account status updated to ${accountStatus}`,
    data: { user: userDoc.toProfileJSON() },
  });
});

// PATCH /api/v1/admin/users/:id/availability — Update Donor Availability
const updateUserAvailability = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isAvailable, donorStatus, reason } = req.body;
  const adminUser = req.user;

  const userDoc = await User.findById(id);
  if (!userDoc) {
    return sendError(res, {
      statusCode: 404,
      message: 'User not found',
    });
  }

  const previousState = { isAvailable: userDoc.isAvailable, donorStatus: userDoc.donorStatus };
  if (isAvailable !== undefined) userDoc.isAvailable = isAvailable;
  if (donorStatus !== undefined) userDoc.donorStatus = donorStatus;

  await userDoc.save();

  // Audit Log
  await AuditLog.create({
    performedBy: adminUser._id,
    userRole: adminUser.role,
    action: 'USER_AVAILABILITY_CHANGED',
    entityType: 'User',
    entityId: userDoc._id.toString(),
    previousState,
    newState: { isAvailable: userDoc.isAvailable, donorStatus: userDoc.donorStatus },
    reason: reason || 'Admin updated donor availability',
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Donor availability updated',
    data: { user: userDoc.toProfileJSON() },
  });
});

function generateTemporaryPassword() {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%&*';

  const getRandomChar = (str) => str.charAt(Math.floor(Math.random() * str.length));

  let pass = '';
  pass += getRandomChar(uppercase);
  pass += getRandomChar(lowercase);
  pass += getRandomChar(numbers);
  pass += getRandomChar(symbols);

  const all = uppercase + lowercase + numbers + symbols;
  for (let i = 0; i < 8; i++) {
    pass += getRandomChar(all);
  }

  return pass.split('').sort(() => 0.5 - Math.random()).join('');
}

/**
 * Generate a unique normalized slugified login ID from organization name
 * e.g., "Civil Hospital Mohali" -> "civilhospitalmohali" (or "civilhospitalmohali01" if collision exists)
 */
async function generateSlugifiedLoginId(orgName) {
  let baseSlug = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
  if (!baseSlug) baseSlug = 'organization';

  let candidate = baseSlug;
  let counter = 1;

  while (true) {
    const existingUser = await User.findOne({
      $or: [
        { email: `${candidate}@wedonate.org` },
        { firebaseUid: `org_login_${candidate}` },
      ],
    });
    if (!existingUser) {
      return candidate;
    }
    const suffix = counter < 10 ? `0${counter}` : `${counter}`;
    candidate = `${baseSlug}${suffix}`;
    counter++;
  }
}

// GET /api/v1/admin/organizations/search-places?query=Civil%20Hospital%20Mohali
const searchGooglePlacesForOrganizations = asyncHandler(async (req, res) => {
  const adminUser = req.user;
  if (!['ADMIN', 'SUPER_ADMIN'].includes(adminUser.role)) {
    return sendError(res, {
      statusCode: 403,
      message: 'Access denied: Admin privileges required to search places',
    });
  }

  const { query } = req.query;
  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return sendSuccess(res, {
      statusCode: 200,
      message: 'Search query empty or too short',
      data: { places: [] },
    });
  }

  const input = query.trim();
  const apiKey = process.env.GOOGLE_MAPS_API_KEY && process.env.GOOGLE_MAPS_API_KEY !== 'your_google_maps_api_key_here'
    ? process.env.GOOGLE_MAPS_API_KEY
    : null;

  let rawPlaces = [];

  if (apiKey) {
    try {
      const response = await axios.post(
        'https://places.googleapis.com/v1/places:searchText',
        {
          textQuery: input,
          includedType: 'hospital',
          maxResultCount: 10,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.addressComponents',
          },
          timeout: 8000,
        }
      );
      rawPlaces = (response.data.places || []).map((p) => {
        const addrComps = p.addressComponents || [];
        const cityComp = addrComps.find(c => c.types?.includes('locality') || c.types?.includes('administrative_area_level_2')) || {};
        const stateComp = addrComps.find(c => c.types?.includes('administrative_area_level_1')) || {};
        return {
          googlePlaceId: p.id,
          name: p.displayName?.text || input,
          address: p.formattedAddress || '',
          city: cityComp.longText || cityComp.shortText || 'Mohali',
          state: stateComp.longText || stateComp.shortText || 'Punjab',
          location: {
            latitude: p.location?.latitude || 30.7046,
            longitude: p.location?.longitude || 76.7179,
          },
          type: p.types?.includes('blood_bank') ? 'BLOOD_BANK' : 'HOSPITAL',
        };
      });
    } catch (googleErr) {
      logger.warn(`Google Places Text Search API error: ${googleErr.message}.`);
    }
  }

  // Fallback search result generator if API key missing or 0 places returned
  if (rawPlaces.length === 0) {
    const slug = input.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isBloodBank = input.toLowerCase().includes('blood') || input.toLowerCase().includes('bank');
    rawPlaces = [
      {
        googlePlaceId: `place_${slug}_01`,
        name: input,
        address: `${input}, Sector 16, Mohali, Punjab`,
        city: 'Mohali',
        state: 'Punjab',
        location: { latitude: 30.7046, longitude: 76.7179 },
        type: isBloodBank ? 'BLOOD_BANK' : 'HOSPITAL',
      },
    ];
  }

  // Check duplicate registration status against existing Organization records in MongoDB
  const placesWithStatus = await Promise.all(
    rawPlaces.map(async (place) => {
      let existingOrg = null;
      if (place.googlePlaceId) {
        existingOrg = await Organization.findOne({ googlePlaceId: place.googlePlaceId });
      }
      if (!existingOrg) {
        const escapedName = place.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        existingOrg = await Organization.findOne({
          name: new RegExp(`^${escapedName}$`, 'i'),
        });
      }

      if (existingOrg) {
        const staffUser = await User.findOne({ organizationId: existingOrg._id }).select('email phone role accountStatus');
        return {
          ...place,
          alreadyRegistered: true,
          registeredOrgId: existingOrg._id,
          accountStatus: staffUser?.accountStatus || 'ACTIVE',
          loginId: staffUser?.email ? staffUser.email.replace(/@wedonate\.org$/, '') : null,
        };
      }

      return {
        ...place,
        alreadyRegistered: false,
        registeredOrgId: null,
      };
    })
  );

  return sendSuccess(res, {
    statusCode: 200,
    message: `Found ${placesWithStatus.length} place result(s)`,
    data: { places: placesWithStatus },
  });
});

// POST /api/v1/admin/organizations/register — Register Organization from Google Place & Create Manager Account
const registerOrganizationWithAccount = asyncHandler(async (req, res) => {
  const adminUser = req.user;
  if (!['ADMIN', 'SUPER_ADMIN'].includes(adminUser.role)) {
    return sendError(res, {
      statusCode: 403,
      message: 'Access denied: Admin privileges required to register organizations',
    });
  }

  const {
    name,
    type,
    address,
    city,
    state,
    pincode,
    latitude,
    longitude,
    googlePlaceId,
    contactPhone,
    officialEmail,
  } = req.body;

  if (!name || !type) {
    return sendError(res, {
      statusCode: 400,
      message: 'Organization name and type are required',
    });
  }

  const orgType = type.toUpperCase() === 'BLOOD_BANK' ? 'BLOOD_BANK' : 'HOSPITAL';
  const orgCity = (city || 'Mohali').trim();
  const orgState = (state || 'Punjab').trim();
  const lat = latitude ? parseFloat(latitude) : 30.7046;
  const lng = longitude ? parseFloat(longitude) : 76.7179;

  // Duplicate Check: Check Google Place ID first, then name + city
  let existingOrg = null;
  if (googlePlaceId) {
    existingOrg = await Organization.findOne({ googlePlaceId });
  }
  if (!existingOrg) {
    const escapedName = name.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const escapedCity = orgCity.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    existingOrg = await Organization.findOne({
      name: new RegExp(`^${escapedName}$`, 'i'),
      'address.city': new RegExp(`^${escapedCity}$`, 'i'),
    });
  }

  if (existingOrg) {
    const existingStaff = await User.findOne({ organizationId: existingOrg._id });
    return sendError(res, {
      statusCode: 409,
      message: 'This organization is already registered.',
      data: {
        alreadyRegistered: true,
        organizationId: existingOrg._id,
        organizationName: existingOrg.name,
        accountStatus: existingStaff?.accountStatus || 'ACTIVE',
        loginId: existingStaff?.email ? existingStaff.email.replace(/@wedonate\.org$/, '') : null,
      },
    });
  }

  // Generate Unique Login ID & Secure Password
  const loginId = await generateSlugifiedLoginId(name);
  const tempPassword = generateTemporaryPassword();

  // Create Organization in MongoDB
  const emailForOrg = (officialEmail || `${loginId}@wedonate.org`).toLowerCase();
  const phoneForOrg = contactPhone || `+9198000${Math.floor(10000 + Math.random() * 90000)}`;

  const organization = await Organization.create({
    name: name.trim(),
    type: orgType,
    googlePlaceId: googlePlaceId || null,
    address: {
      street: address || '',
      city: orgCity,
      state: orgState,
      pincode: pincode || '160055',
      country: 'India',
    },
    location: {
      type: 'Point',
      coordinates: [lng, lat],
    },
    contactPhone: phoneForOrg,
    officialEmail: emailForOrg,
    authorizedPerson: {
      name: `${name.trim()} Manager`,
      phone: phoneForOrg,
      email: emailForOrg,
    },
    status: 'APPROVED',
  });

  // Create Organization Manager User Account
  const targetRole = orgType === 'BLOOD_BANK' ? 'BLOOD_BANK_MANAGER' : 'HOSPITAL_MANAGER';
  const staffUser = await User.create({
    firebaseUid: `org_login_${loginId}`,
    phone: phoneForOrg,
    email: `${loginId}@wedonate.org`,
    fullName: `${organization.name} Manager`,
    role: targetRole,
    organizationId: organization._id,
    password: tempPassword,
    isVerified: true,
    accountStatus: 'ACTIVE',
  });

  // Audit log
  await AuditLog.create({
    action: 'ORGANIZATION_REGISTERED',
    performedBy: adminUser._id,
    userRole: adminUser.role,
    entityType: 'Organization',
    entityId: organization._id.toString(),
    reason: `Admin registered ${organization.name} (${orgType}) with loginId ${loginId}`,
  });

  logger.info(`Admin ${adminUser._id} registered Organization ${organization.name} (${orgType}) with loginId ${loginId}`);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Organization registered and login account created successfully',
    data: {
      organization: {
        id: organization._id,
        name: organization.name,
        type: organization.type,
        city: organization.address.city,
        address: organization.address.street || organization.address.city,
        googlePlaceId: organization.googlePlaceId,
      },
      loginId,
      temporaryPassword: tempPassword,
      role: targetRole,
    },
  });
});

// GET /api/v1/admin/organizations — List Registered Organizations with Account Status
const getOrganizationsList = asyncHandler(async (req, res) => {
  const { status, type, city, search } = req.query;
  const filter = {};
  if (status && status !== 'all') filter.status = status;
  if (type && type !== 'all') filter.type = type;
  if (city && city.trim().length > 0) filter['address.city'] = new RegExp(city.trim(), 'i');

  if (search && search.trim().length > 0) {
    const s = search.trim();
    if (/^[0-9a-fA-F]{24}$/.test(s)) {
      filter._id = s;
    } else {
      const searchRegex = new RegExp(s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
      filter.$or = [
        { name: searchRegex },
        { 'address.city': searchRegex },
        { officialEmail: searchRegex },
        { registrationLicense: searchRegex },
      ];
    }
  }

  const rawOrgs = await Organization.find(filter).sort({ createdAt: -1 });

  // Filter & Attach linked manager User account status for each organization
  const organizations = [];
  for (const org of rawOrgs) {
    const orgJson = org.toJSON();
    const staffUser = await User.findOne({ organizationId: org._id }).select('email phone role accountStatus isActive createdAt');
    
    // Only include registered organizations (having a linked staff User account or a googlePlaceId)
    if (staffUser || org.googlePlaceId) {
      orgJson.account = staffUser
        ? {
            hasAccount: true,
            userId: staffUser._id,
            loginId: staffUser.email ? staffUser.email.replace(/@wedonate\.org$/, '') : staffUser.phone,
            email: staffUser.email,
            phone: staffUser.phone,
            role: staffUser.role,
            accountStatus: staffUser.accountStatus,
            isActive: staffUser.isActive,
            createdAt: staffUser.createdAt,
          }
        : {
            hasAccount: false,
            accountStatus: 'NO_ACCOUNT',
          };
      organizations.push(orgJson);
    }
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${organizations.length} organization(s)`,
    data: {
      organizations,
    },
  });
});

// POST /api/v1/admin/organizations/:id/account — Create Manager Account for Organization
const createOrganizationAccount = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { loginId, password } = req.body;
  const adminUser = req.user;

  if (!['ADMIN', 'SUPER_ADMIN'].includes(adminUser.role)) {
    return sendError(res, {
      statusCode: 403,
      message: 'Access denied: Admin privileges required to manage organization accounts',
    });
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Invalid organization ID format',
    });
  }

  const organization = await Organization.findById(id);
  if (!organization) {
    return sendError(res, {
      statusCode: 404,
      message: 'Organization not found',
    });
  }

  // Duplicate Check: Check if manager account already exists for this organization
  const existingAccount = await User.findOne({ organizationId: organization._id });
  if (existingAccount) {
    return sendError(res, {
      statusCode: 409,
      message: 'Account already exists for this organization',
      data: {
        organizationId: organization._id,
        organizationName: organization.name,
        accountStatus: existingAccount.accountStatus,
        loginId: existingAccount.email || existingAccount.phone,
        role: existingAccount.role,
        userId: existingAccount._id,
      },
    });
  }

  // Determine Login ID (Email or Phone)
  let finalLoginId = (loginId || '').trim();
  if (!finalLoginId) {
    finalLoginId = organization.officialEmail || organization.contactPhone;
  }
  if (!finalLoginId) {
    return sendError(res, {
      statusCode: 400,
      message: 'Login ID (email or phone) is required for organization account creation',
    });
  }

  // Determine password
  let tempPassword = (password || '').trim();
  if (!tempPassword) {
    tempPassword = generateTemporaryPassword();
  } else if (tempPassword.length < 8) {
    return sendError(res, {
      statusCode: 400,
      message: 'Password must be at least 8 characters long',
    });
  }

  // Derivation of Role strictly based on organization.type
  const role = organization.type === 'HOSPITAL' ? 'HOSPITAL_MANAGER' : 'BLOOD_BANK_MANAGER';
  const isEmail = finalLoginId.includes('@');

  const staffUser = new User({
    firebaseUid: `org_mgr_${organization._id}_${Date.now()}`,
    fullName: organization.authorizedPerson?.name || organization.name,
    name: organization.name,
    email: isEmail ? finalLoginId.toLowerCase() : organization.officialEmail.toLowerCase(),
    phone: !isEmail ? finalLoginId : (organization.authorizedPerson?.phone || organization.contactPhone),
    role,
    organizationId: organization._id,
    accountStatus: 'ACTIVE',
    isActive: true,
    isVerified: true,
    password: tempPassword, // Will be bcrypt-hashed in User pre-save hook
  });

  await staffUser.save();

  // Audit Log
  await AuditLog.create({
    performedBy: adminUser._id,
    userRole: adminUser.role,
    action: 'ORGANIZATION_ACCOUNT_CREATED',
    entityType: 'Organization',
    entityId: organization._id.toString(),
    newState: {
      organizationName: organization.name,
      role,
      loginId: finalLoginId,
      accountStatus: 'ACTIVE',
    },
    reason: `Admin created ${role} account for '${organization.name}'`,
  });

  logger.info(`Admin ${adminUser._id} created ${role} account for Organization ${organization._id}`);

  return sendSuccess(res, {
    statusCode: 201,
    message: `Login account created successfully for '${organization.name}'`,
    data: {
      organizationId: organization._id,
      organizationName: organization.name,
      loginId: finalLoginId,
      role,
      accountStatus: staffUser.accountStatus,
      temporaryPassword: tempPassword, // Exposed ONCE in initial response payload
    },
  });
});

// POST /api/v1/admin/organizations/:id/account/reset-password — Reset Organization Password
const resetOrganizationAccountPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  const adminUser = req.user;

  if (!['ADMIN', 'SUPER_ADMIN'].includes(adminUser.role)) {
    return sendError(res, {
      statusCode: 403,
      message: 'Access denied: Admin privileges required to reset organization password',
    });
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Invalid organization ID format',
    });
  }

  const organization = await Organization.findById(id);
  if (!organization) {
    return sendError(res, {
      statusCode: 404,
      message: 'Organization not found',
    });
  }

  const staffUser = await User.findOne({ organizationId: organization._id });
  if (!staffUser) {
    return sendError(res, {
      statusCode: 404,
      message: 'No login account exists for this organization. Please create an account first.',
    });
  }

  let tempPassword = (newPassword || '').trim();
  if (!tempPassword) {
    tempPassword = generateTemporaryPassword();
  } else if (tempPassword.length < 8) {
    return sendError(res, {
      statusCode: 400,
      message: 'New password must be at least 8 characters long',
    });
  }

  // Update password & invalidate active sessions
  staffUser.password = tempPassword;
  staffUser.refreshTokenHashes = []; // Invalidate existing refresh tokens
  await staffUser.save(); // Hashes password via User pre-save hook

  // Audit Log
  await AuditLog.create({
    performedBy: adminUser._id,
    userRole: adminUser.role,
    action: 'ORGANIZATION_ACCOUNT_PASSWORD_RESET',
    entityType: 'Organization',
    entityId: organization._id.toString(),
    newState: { organizationName: organization.name },
    reason: `Admin reset password for organization '${organization.name}'`,
  });

  logger.info(`Admin ${adminUser._id} reset password for Organization ${organization._id}`);

  return sendSuccess(res, {
    statusCode: 200,
    message: `Password reset successfully for '${organization.name}'`,
    data: {
      organizationId: organization._id,
      organizationName: organization.name,
      loginId: staffUser.email || staffUser.phone,
      temporaryPassword: tempPassword, // Returned ONCE in response
    },
  });
});

// PATCH /api/v1/admin/organizations/:id/account-status — Activate/Suspend Organization Account
const updateOrganizationAccountStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { accountStatus, reason } = req.body;
  const adminUser = req.user;

  if (!['ADMIN', 'SUPER_ADMIN'].includes(adminUser.role)) {
    return sendError(res, {
      statusCode: 403,
      message: 'Access denied: Admin privileges required to update organization account status',
    });
  }

  if (!['ACTIVE', 'SUSPENDED', 'INACTIVE'].includes(accountStatus)) {
    return sendError(res, {
      statusCode: 400,
      message: 'accountStatus must be ACTIVE, SUSPENDED, or INACTIVE',
    });
  }

  const organization = await Organization.findById(id);
  if (!organization) {
    return sendError(res, {
      statusCode: 404,
      message: 'Organization not found',
    });
  }

  const staffUser = await User.findOne({ organizationId: organization._id });
  if (!staffUser) {
    return sendError(res, {
      statusCode: 404,
      message: 'No login account exists for this organization',
    });
  }

  const previousStatus = staffUser.accountStatus;
  staffUser.accountStatus = accountStatus;

  if (accountStatus === 'SUSPENDED') {
    staffUser.isActive = false;
    staffUser.refreshTokenHashes = []; // Revoke active sessions
    organization.status = 'SUSPENDED';
    await organization.save();
  } else if (accountStatus === 'ACTIVE') {
    staffUser.isActive = true;
    if (organization.status === 'SUSPENDED') {
      organization.status = 'APPROVED';
      await organization.save();
    }
  }

  await staffUser.save();

  const actionName = accountStatus === 'ACTIVE' ? 'ORGANIZATION_ACCOUNT_ACTIVATED' : 'ORGANIZATION_ACCOUNT_SUSPENDED';

  // Audit Log
  await AuditLog.create({
    performedBy: adminUser._id,
    userRole: adminUser.role,
    action: actionName,
    entityType: 'Organization',
    entityId: organization._id.toString(),
    previousState: { accountStatus: previousStatus },
    newState: { accountStatus, organizationStatus: organization.status },
    reason: reason || `Admin set account status to ${accountStatus}`,
  });

  logger.info(`Admin ${adminUser._id} set Organization ${organization._id} account status to ${accountStatus}`);

  return sendSuccess(res, {
    statusCode: 200,
    message: `Organization account status updated to ${accountStatus}`,
    data: {
      organizationId: organization._id,
      organizationName: organization.name,
      accountStatus: staffUser.accountStatus,
      organizationStatus: organization.status,
    },
  });
});

// PATCH /api/v1/admin/organizations/:id/status — Approve/Reject/Suspend Organization
const updateOrganizationStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body;
  const adminUser = req.user;

  if (!['APPROVED', 'REJECTED', 'SUSPENDED'].includes(status)) {
    return sendError(res, {
      statusCode: 400,
      message: 'Status must be APPROVED, REJECTED, or SUSPENDED',
    });
  }

  const organization = await Organization.findById(id);
  if (!organization) {
    return sendError(res, {
      statusCode: 404,
      message: 'Organization not found',
    });
  }

  const previousState = organization.status;
  organization.status = status;
  if (status === 'APPROVED') {
    organization.verifiedBy = adminUser._id;
    organization.verifiedAt = new Date();
  } else if (status === 'REJECTED') {
    organization.rejectionReason = rejectionReason || 'Failed license/documentation check';
  }

  await organization.save();

  // Audit Log
  await AuditLog.create({
    performedBy: adminUser._id,
    userRole: adminUser.role,
    action: `ADMIN_${status}_ORGANIZATION`,
    entityType: 'Organization',
    entityId: organization._id.toString(),
    previousState: { status: previousState },
    newState: { status, rejectionReason },
    reason: rejectionReason || `Admin set status to ${status}`,
  });

  logger.info(`Admin ${adminUser._id} set Organization ${organization._id} status to ${status}`);

  return sendSuccess(res, {
    statusCode: 200,
    message: `Organization status updated to ${status}`,
    data: {
      organization,
    },
  });
});

// GET /api/v1/admin/requests/pending — Fallback Verification Queue for Admin
const getPendingRequestsForAdmin = asyncHandler(async (req, res) => {
  const pendingRequests = await BloodRequest.find({ status: 'VERIFICATION_PENDING' })
    .populate('requesterId', 'fullName name phone bloodGroup email')
    .populate('targetOrganizationId', 'name contactPhone officialEmail')
    .sort({ createdAt: 1 })
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${pendingRequests.length} pending request(s) awaiting verification`,
    data: {
      requests: pendingRequests,
    },
  });
});

// GET /api/v1/admin/requests — Get All Requests Across All Organizations
const getAllRequestsForAdmin = asyncHandler(async (req, res) => {
  const { status, bloodGroup, urgency } = req.query;
  const filter = {};
  
  if (status && status !== 'ALL') {
    if (status === 'OPEN') {
      filter.status = {
        $in: ['OPEN', 'VERIFICATION_PENDING', 'HOSPITAL_VERIFIED', 'ADMIN_VERIFIED', 'MATCHING', 'DONOR_RESPONDED', 'DONOR_CONFIRMED'],
      };
    } else if (status === 'CLOSED') {
      filter.status = {
        $in: ['FULFILLED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
      };
    } else if (status === 'PENDING') {
      filter.status = {
        $in: ['PENDING', 'VERIFICATION_PENDING'],
      };
    } else {
      filter.status = status;
    }
  }

  if (bloodGroup && bloodGroup !== 'ALL') filter.bloodGroup = bloodGroup;
  if (urgency && urgency !== 'ALL') filter.urgency = urgency;

  const requests = await BloodRequest.find(filter)
    .populate('requesterId', 'fullName name phone bloodGroup email')
    .populate('targetOrganizationId', 'name contactPhone officialEmail')
    .sort({ createdAt: -1 })
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${requests.length} request(s) for platform admin`,
    data: {
      requests,
    },
  });
});

// PATCH /api/v1/admin/requests/:id/verify — Admin Fallback Manual Request Verification
const verifyRequestByAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, reason } = req.body;
  const adminUser = req.user;

  const bloodRequest = await BloodRequest.findById(id);
  if (!bloodRequest) {
    return sendError(res, {
      statusCode: 404,
      message: 'Blood request not found',
    });
  }

  const previousState = bloodRequest.status;
  if (action === 'REJECT') {
    bloodRequest.status = 'REJECTED';
    bloodRequest.rejectionReason = reason || 'Admin manual rejection';
    await bloodRequest.save();

    await AuditLog.create({
      performedBy: adminUser._id,
      userRole: adminUser.role,
      action: 'ADMIN_REJECTED_REQUEST',
      entityType: 'BloodRequest',
      entityId: bloodRequest._id.toString(),
      previousState: { status: previousState },
      newState: { status: 'REJECTED' },
      reason: reason || 'Admin rejected request',
    });

    return sendSuccess(res, {
      statusCode: 200,
      message: 'Blood request rejected by platform admin',
      data: { request: bloodRequest },
    });
  }

  bloodRequest.status = 'ADMIN_VERIFIED';
  bloodRequest.verifiedBy = adminUser._id;
  bloodRequest.verificationSource = 'ADMIN_MANUAL';
  bloodRequest.verificationNotes = reason || 'Admin verified patient emergency requirement';
  await bloodRequest.save();

  await AuditLog.create({
    performedBy: adminUser._id,
    userRole: adminUser.role,
    action: 'ADMIN_VERIFIED_REQUEST',
    entityType: 'BloodRequest',
    entityId: bloodRequest._id.toString(),
    previousState: { status: previousState },
    newState: { status: 'ADMIN_VERIFIED' },
    reason: reason || 'Admin verified request',
  });

  // Trigger matching engine
  try {
    const { findAndMatchNearbyDonors } = require('../services/donorMatchingService');
    await findAndMatchNearbyDonors(bloodRequest._id);
  } catch (matchErr) {
    logger.warn(`Donor matching warning after admin verification: ${matchErr.message}`);
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Blood request verified by admin. Donor matching initiated.',
    data: { request: bloodRequest },
  });
});

// GET /api/v1/admin/audit-logs — System Audit Logs
const getAuditLogs = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit || 100, 10);
  const logs = await AuditLog.find({})
    .populate('performedBy', 'fullName name phone role email')
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${logs.length} audit log record(s)`,
    data: { logs },
  });
});

// GET /api/v1/admin/whatsapp-config — Inspect WhatsApp service configuration safely
const getWhatsAppConfigStatusController = asyncHandler(async (req, res) => {
  const { getWhatsAppConfigStatus } = require('../services/whatsappService');
  const status = getWhatsAppConfigStatus();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'WhatsApp service configuration status retrieved',
    data: {
      whatsappConfig: status,
    },
  });
});

// GET /api/v1/admin/donors — Operational Donor Management List
const getAdminDonorsList = asyncHandler(async (req, res) => {
  const { search, bloodGroup, status } = req.query;
  const filter = { isDonor: true };

  if (bloodGroup && bloodGroup !== 'ALL') {
    filter.bloodGroup = bloodGroup;
  }

  if (search) {
    const searchRegex = new RegExp(search, 'i');
    filter.$or = [
      { fullName: searchRegex },
      { name: searchRegex },
      { phone: searchRegex },
      { email: searchRegex },
    ];
  }

  const now = new Date();

  if (status === 'AVAILABLE') {
    filter.isAvailable = true;
  } else if (status === 'UNAVAILABLE') {
    filter.isAvailable = false;
  } else if (status === 'ELIGIBLE') {
    filter.isAvailable = true;
    filter.$and = filter.$and || [];
    filter.$and.push({
      $or: [
        { nextEligibleDate: { $exists: false } },
        { nextEligibleDate: null },
        { nextEligibleDate: { $lte: now } },
      ],
    });
  } else if (status === 'NOT_ELIGIBLE') {
    filter.nextEligibleDate = { $gt: now };
  }

  const donors = await User.find(filter)
    .select('-password -refreshTokenHashes')
    .sort({ createdAt: -1 })
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: `Retrieved ${donors.length} donor record(s)`,
    data: { donors },
  });
});

// GET /api/v1/admin/donors/:id/history — Aggregated Donor Operational History
const getDonorDetailsHistory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const donor = await User.findById(id).select('-password -refreshTokenHashes');
  if (!donor) {
    return sendError(res, {
      statusCode: 404,
      message: 'Donor not found',
    });
  }

  const physicalDonations = await DonationRegistration.find({ donorId: id })
    .populate('organizationId', 'name city type')
    .populate('campId', 'title location')
    .sort({ createdAt: -1 })
    .exec();

  const campRegistrations = await CampRegistration.find({ userId: id })
    .populate('campId', 'title location organizerName')
    .sort({ createdAt: -1 })
    .exec();

  const matchHistory = await DonorMatch.find({ donor: id })
    .populate('bloodRequest')
    .populate('requester', 'fullName name phone')
    .sort({ createdAt: -1 })
    .exec();

  const auditLogs = await AuditLog.find({
    $or: [{ entityId: id.toString() }, { performedBy: id }],
  })
    .populate('performedBy', 'fullName name role')
    .sort({ createdAt: -1 })
    .limit(50)
    .exec();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Donor profile and operational history retrieved',
    data: {
      donor: donor.toProfileJSON ? donor.toProfileJSON() : donor,
      physicalDonations,
      campRegistrations,
      matchHistory,
      auditLogs,
    },
  });
});

// GET /api/v1/admin/requests/:id/notifications — View Notification Campaign History & Metrics
const getRequestNotificationHistory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const bloodRequest = await BloodRequest.findById(id);
  if (!bloodRequest) {
    return sendError(res, {
      statusCode: 404,
      message: 'Blood request not found',
    });
  }

  // Authorization check for hospital role
  if (req.user.role === 'HOSPITAL_MANAGER' && bloodRequest.targetOrganizationId && bloodRequest.targetOrganizationId.toString() !== req.user.organizationId?.toString()) {
    return sendError(res, {
      statusCode: 403,
      message: 'Unauthorized: Hospital can only view notification history for its own organization requests',
    });
  }

  const matches = await DonorMatch.find({ bloodRequest: bloodRequest._id })
    .populate('donor', 'fullName name bloodGroup isAvailable isEligible phone location')
    .sort({ distanceKm: 1 });

  const notifications = await Notification.find({ bloodRequest: bloodRequest._id })
    .populate('user', 'fullName name phone bloodGroup')
    .sort({ createdAt: -1 });

  const fcmNotifs = notifications.filter((n) => n.channel === 'FCM');
  const waNotifs = notifications.filter((n) => n.channel === 'WHATSAPP');
  const smsNotifs = notifications.filter((n) => n.channel === 'SMS');

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Notification campaign history retrieved successfully',
    data: {
      requestId: bloodRequest._id,
      bloodGroup: bloodRequest.bloodGroup,
      hospitalName: bloodRequest.hospitalName,
      urgency: bloodRequest.urgency,
      status: bloodRequest.status,
      campaign: bloodRequest.notificationCampaign,
      matchedCount: matches.length,
      matches: matches.map((m) => ({
        matchId: m._id,
        donor: {
          id: m.donor?._id,
          name: m.donor?.fullName || m.donor?.name || 'Candidate Donor',
          bloodGroup: m.donor?.bloodGroup,
          phone: m.status === 'ACCEPTED' ? m.donor?.phone : undefined, // Phone hidden unless accepted
        },
        distanceKm: m.distanceKm,
        status: m.status,
        matchedAt: m.matchedAt,
        respondedAt: m.respondedAt,
      })),
      channelSummary: {
        fcm: {
          total: fcmNotifs.length,
          dispatched: fcmNotifs.filter((n) => ['SENT', 'DISPATCHED', 'DELIVERED', 'SIMULATED'].includes(n.status)).length,
          failed: fcmNotifs.filter((n) => n.status === 'FAILED').length,
        },
        whatsApp: {
          total: waNotifs.length,
          dispatched: waNotifs.filter((n) => n.status === 'DISPATCHED').length,
          simulated: waNotifs.filter((n) => n.status === 'SIMULATED').length,
          notConfigured: waNotifs.filter((n) => n.status === 'NOT_CONFIGURED').length,
          failed: waNotifs.filter((n) => n.status === 'FAILED').length,
        },
        sms: {
          total: smsNotifs.length,
          dispatched: smsNotifs.filter((n) => n.status === 'DISPATCHED').length,
          failed: smsNotifs.filter((n) => n.status === 'FAILED').length,
        },
      },
      notifications: notifications.map((n) => ({
        id: n._id,
        recipient: n.user?.fullName || n.user?.name || 'Donor',
        channel: n.channel,
        type: n.type,
        status: n.status,
        batchIndex: n.batchIndex,
        sentAt: n.sentAt,
        providerMessageId: n.providerMessageId,
        error: n.error,
      })),
    },
  });
});

// POST /api/v1/admin/requests/:id/notifications/retry — Retry/Force Next Notification Batch
const retryRequestNotificationBatch = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminUser = req.user;

  const bloodRequest = await BloodRequest.findById(id);
  if (!bloodRequest) {
    return sendError(res, {
      statusCode: 404,
      message: 'Blood request not found',
    });
  }

  const { dispatchNotificationBatchForRequest } = require('../services/notificationCampaignService');

  // Reset isStopped if manual retry initiated
  if (bloodRequest.notificationCampaign?.isStopped) {
    bloodRequest.notificationCampaign.isStopped = false;
    bloodRequest.notificationCampaign.stopReason = null;
    await bloodRequest.save();
  }

  const result = await dispatchNotificationBatchForRequest(bloodRequest._id, { forceNext: true });

  await AuditLog.create({
    performedBy: adminUser._id,
    userRole: adminUser.role,
    action: 'RETRY_NOTIFICATION_CAMPAIGN',
    entityType: 'BloodRequest',
    entityId: bloodRequest._id.toString(),
    newState: result,
    reason: 'Manual operator trigger for notification batch dispatch',
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: result.dispatched
      ? `Notification batch ${result.batchIndex} successfully dispatched to ${result.batchSize} donor(s)`
      : result.reason || 'No notification batch dispatched',
    data: result,
  });
});

// POST /api/v1/admin/requests/:id/notifications/stop — Stop Emergency Notification Campaign
const stopRequestNotificationCampaign = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const adminUser = req.user;

  const { stopNotificationCampaign } = require('../services/notificationCampaignService');
  const campaign = await stopNotificationCampaign(id, reason || 'Stopped by operator');

  await AuditLog.create({
    performedBy: adminUser._id,
    userRole: adminUser.role,
    action: 'STOP_NOTIFICATION_CAMPAIGN',
    entityType: 'BloodRequest',
    entityId: String(id),
    newState: campaign,
    reason: reason || 'Operator stopped notification campaign',
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Emergency notification campaign stopped successfully',
    data: { campaign },
  });
});

module.exports = {
  getAdminDashboardMetrics,
  getUsersList,
  getAdminDonorsList,
  getDonorDetailsHistory,
  updateUserStatus,
  updateUserAvailability,
  getOrganizationsList,
  searchGooglePlacesForOrganizations,
  registerOrganizationWithAccount,
  createOrganizationAccount,
  resetOrganizationAccountPassword,
  updateOrganizationAccountStatus,
  updateOrganizationStatus,
  getPendingRequestsForAdmin,
  getAllRequestsForAdmin,
  verifyRequestByAdmin,
  getAuditLogs,
  getWhatsAppConfigStatusController,
  getRequestNotificationHistory,
  retryRequestNotificationBatch,
  stopRequestNotificationCampaign,
};
