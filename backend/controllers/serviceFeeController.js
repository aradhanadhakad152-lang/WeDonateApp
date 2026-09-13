'use strict';

const crypto = require('crypto');
const ServiceTransaction = require('../models/ServiceTransaction');
const BloodRequest = require('../models/BloodRequest');
const Organization = require('../models/Organization');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * Internal Helper: Triggers ₹99 Platform Service Fee record upon qualifying request completion.
 * Server-enforced amount = 99. Idempotent check prevents duplicates.
 */
const triggerServiceFeeForCompletedRequest = async (bloodRequest) => {
  if (!bloodRequest || !bloodRequest._id) return null;

  const existingTx = await ServiceTransaction.findOne({ requestId: bloodRequest._id });
  if (existingTx) {
    return existingTx;
  }

  const rawOrg = bloodRequest.targetOrganizationId || bloodRequest.requesterId;
  const orgId = rawOrg?._id || rawOrg;
  if (!orgId) return null;

  const transaction = await ServiceTransaction.create({
    requestId: bloodRequest._id,
    organizationId: orgId,
    amount: 99, // Server-controlled constant amount
    currency: 'INR',
    status: 'PENDING',
    description: `WE DONATE Platform Service Fee — Technology & Donation Coordination (Req: ${bloodRequest._id})`,
    paymentGateway: 'RAZORPAY',
  });

  logger.info(`₹99 Platform Service Fee generated for Request ${bloodRequest._id} (Org: ${orgId})`);
  return transaction;
};

/**
 * POST /api/v1/payments/create-order
 * Creates a gateway-ready payment order for ₹99 Platform Service Fee.
 */
const createPaymentOrder = asyncHandler(async (req, res) => {
  const { requestId } = req.body;
  if (!requestId) {
    return sendError(res, {
      statusCode: 400,
      message: 'requestId is required to initiate service fee payment order',
    });
  }

  const bloodRequest = await BloodRequest.findById(requestId);
  if (!bloodRequest) {
    return sendError(res, {
      statusCode: 404,
      message: 'Blood request not found',
    });
  }

  // Authorization check: Hospital must own request unless Admin
  if (
    req.user.role !== 'SUPER_ADMIN' &&
    req.user.role !== 'ADMIN' &&
    String(bloodRequest.targetOrganizationId) !== String(req.user.organizationId)
  ) {
    return sendError(res, {
      statusCode: 403,
      message: 'Unauthorized: You can only pay platform service fees for your hospital requests',
    });
  }

  let transaction = await triggerServiceFeeForCompletedRequest(bloodRequest);
  if (!transaction) {
    return sendError(res, {
      statusCode: 400,
      message: 'Service transaction could not be generated for this request state',
    });
  }

  if (transaction.status === 'PAID') {
    return sendError(res, {
      statusCode: 400,
      message: 'Platform service fee for this request is already PAID',
      data: { transaction },
    });
  }

  const razorpayKeyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_wedonate_dummy_key';
  const orderData = {
    orderId: transaction.razorpayOrderId || `order_wd_${transaction._id}_${Date.now()}`,
    amount: 9900, // Razorpay uses paise (99 INR = 9900 paise)
    amountFormatted: 99,
    currency: 'INR',
    keyId: razorpayKeyId,
    requestId: bloodRequest._id,
    organizationId: transaction.organizationId,
    description: 'WE DONATE Platform Service Fee — Technology & Donation Coordination',
    gatewayConfigured: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
  };

  if (!transaction.razorpayOrderId) {
    transaction.razorpayOrderId = orderData.orderId;
    await transaction.save();
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Payment order created successfully',
    data: {
      order: orderData,
      transaction,
    },
  });
});

/**
 * POST /api/v1/payments/verify
 * Verifies Gateway Payment Signature and marks transaction PAID.
 */
const verifyPaymentSignature = asyncHandler(async (req, res) => {
  const { requestId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

  if (!requestId) {
    return sendError(res, {
      statusCode: 400,
      message: 'requestId is required',
    });
  }

  const transaction = await ServiceTransaction.findOne({ requestId });
  if (!transaction) {
    return sendError(res, {
      statusCode: 404,
      message: 'Service transaction not found for this request',
    });
  }

  if (transaction.status === 'PAID') {
    return sendSuccess(res, {
      statusCode: 200,
      message: 'Payment already verified and marked PAID',
      data: { transaction },
    });
  }

  // If live Razorpay secret exists, verify signature HMAC
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
  if (razorpaySecret) {
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return sendError(res, {
        statusCode: 400,
        message: 'razorpayOrderId, razorpayPaymentId, and razorpaySignature are required for verification',
      });
    }

    const generatedSignature = crypto
      .createHmac('sha256', razorpaySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (generatedSignature !== razorpaySignature) {
      transaction.status = 'FAILED';
      await transaction.save();

      return sendError(res, {
        statusCode: 400,
        message: 'Invalid payment signature. Payment verification failed.',
      });
    }
  } else {
    // If no live gateway secret is configured, require explicit verified gateway callback parameter
    if (!razorpayPaymentId) {
      return sendError(res, {
        statusCode: 400,
        message: 'Gateway payment ID required for payment verification callback',
      });
    }
  }

  const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

  transaction.status = 'PAID';
  transaction.razorpayPaymentId = razorpayPaymentId || `pay_${Date.now()}`;
  if (razorpayOrderId) transaction.razorpayOrderId = razorpayOrderId;
  if (razorpaySignature) transaction.razorpaySignature = razorpaySignature;
  transaction.transactionId = transaction.razorpayPaymentId;
  transaction.invoiceNumber = invoiceNumber;
  transaction.paidAt = new Date();

  await transaction.save();

  await AuditLog.create({
    action: 'SERVICE_FEE_PAID',
    performedBy: req.user._id,
    userRole: req.user.role,
    entityType: 'ServiceTransaction',
    entityId: transaction._id.toString(),
    reason: `₹99 Platform Service Fee paid for Request ${requestId} (Invoice: ${invoiceNumber})`,
  });

  logger.info(`Service fee transaction ${transaction._id} marked PAID (Invoice: ${invoiceNumber})`);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Payment verified and service fee marked PAID successfully',
    data: { transaction },
  });
});

/**
 * GET /api/v1/admin/revenue
 * Admin Portal — Service Fee Revenue Analytics & Transaction List
 */
const getAdminRevenueStats = asyncHandler(async (req, res) => {
  const { status, organizationId, startDate, endDate, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (organizationId) filter.organizationId = organizationId;

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  // Aggregate global counts and amounts
  const aggregateResults = await ServiceTransaction.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
      },
    },
  ]);

  const metrics = {
    totalTransactions: 0,
    paidCount: 0,
    pendingCount: 0,
    failedCount: 0,
    refundedCount: 0,
    collectedRevenue: 0,
    pendingRevenue: 0,
  };

  aggregateResults.forEach((item) => {
    metrics.totalTransactions += item.count;
    if (item._id === 'PAID') {
      metrics.paidCount = item.count;
      metrics.collectedRevenue = item.totalAmount;
    } else if (item._id === 'PENDING') {
      metrics.pendingCount = item.count;
      metrics.pendingRevenue = item.totalAmount;
    } else if (item._id === 'FAILED') {
      metrics.failedCount = item.count;
    } else if (item._id === 'REFUNDED') {
      metrics.refundedCount = item.count;
    }
  });

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const skip = (pageNum - 1) * limitNum;

  const totalFiltered = await ServiceTransaction.countDocuments(filter);
  const transactions = await ServiceTransaction.find(filter)
    .populate('requestId', 'patientName bloodGroup unitsRequired urgency status createdAt')
    .populate('organizationId', 'name type city contactPhone officialEmail')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Admin revenue stats retrieved successfully',
    data: {
      metrics,
      pagination: {
        totalFiltered,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalFiltered / limitNum),
      },
      transactions,
    },
  });
});

module.exports = {
  triggerServiceFeeForCompletedRequest,
  createPaymentOrder,
  verifyPaymentSignature,
  getAdminRevenueStats,
};
