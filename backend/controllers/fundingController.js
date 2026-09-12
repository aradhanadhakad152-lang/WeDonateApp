'use strict';

const FundingCampaign = require('../models/FundingCampaign');
const FinancialDonation = require('../models/FinancialDonation');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

// GET /api/v1/funding/campaigns — List Financial Campaigns
const getCampaigns = asyncHandler(async (req, res) => {
  let campaigns = await FundingCampaign.find({ status: 'ACTIVE' }).sort({ createdAt: -1 });

  // Seed default campaign if none exists
  if (campaigns.length === 0) {
    const adminUser = req.user?._id || new (require('mongoose').Types.ObjectId)();
    const defaultCampaign = new FundingCampaign({
      title: 'Emergency Blood Transport & Mobile Medical Units',
      description: 'Support WE DONATE emergency blood transportation vehicles, refrigerated cold-chain storage, and free mobile blood donation camps in remote areas.',
      targetAmount: 500000,
      amountRaised: 125000,
      currency: 'INR',
      status: 'ACTIVE',
      createdBy: adminUser,
    });
    await defaultCampaign.save();
    campaigns = [defaultCampaign];
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Funding campaigns retrieved successfully',
    data: { campaigns },
  });
});

// POST /api/v1/funding/donate — Contribute Financial Support & Issue Receipt
const processFinancialContribution = asyncHandler(async (req, res) => {
  const { campaignId, donorName, donorEmail, donorPhone, amount } = req.body;

  if (!campaignId || !donorName || !donorEmail || !amount) {
    return sendError(res, {
      statusCode: 400,
      message: 'Campaign ID, donor name, donor email, and contribution amount are required',
    });
  }

  const campaign = await FundingCampaign.findById(campaignId);
  if (!campaign) {
    return sendError(res, {
      statusCode: 404,
      message: 'Funding campaign not found',
    });
  }

  const txAmount = parseFloat(amount);
  const transactionId = `TXN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const receiptNumber = `RCP_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const donation = new FinancialDonation({
    campaignId,
    donorName,
    donorEmail: donorEmail.toLowerCase(),
    donorPhone: donorPhone || '',
    amount: txAmount,
    currency: 'INR',
    transactionStatus: 'SUCCESS',
    transactionId,
    receiptNumber,
  });

  await donation.save();

  // Update Campaign Raised Amount
  campaign.amountRaised += txAmount;
  if (campaign.amountRaised >= campaign.targetAmount) {
    campaign.status = 'COMPLETED';
  }
  await campaign.save();

  logger.info(`Financial donation recorded: ${receiptNumber} (${txAmount} INR) for campaign ${campaignId}`);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Thank you for your financial support! Payment received and receipt generated.',
    data: {
      donation,
      campaign,
    },
  });
});

module.exports = {
  getCampaigns,
  processFinancialContribution,
};
