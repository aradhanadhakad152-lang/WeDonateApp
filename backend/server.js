'use strict';

// Load environment variables FIRST — before any other imports
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const mongoose = require('mongoose');

const connectDB = require('./config/database');
const logger = require('./utils/logger');
const { sendSuccess, sendError } = require('./utils/apiResponse');
const { generalLimiter } = require('./middleware/rateLimiter');
const { errorHandler } = require('./middleware/errorHandler');

const path = require('path');

// Route modules
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const requestRoutes = require('./routes/requestRoutes');
const matchRoutes = require('./routes/matchRoutes');
const donorRoutes = require('./routes/donorRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const hospitalRoutes = require('./routes/hospitalRoutes');
const organizationRoutes = require('./routes/organizationRoutes');
const adminRoutes = require('./routes/adminRoutes');
const campRoutes = require('./routes/campRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const fundingRoutes = require('./routes/fundingRoutes');
const donationRoutes = require('./routes/donationRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

// ============================================
// App initialization
// ============================================
const app = express();
const PORT = process.env.PORT || 5000;
const API_VERSION = 'v1';

// ============================================
// Security middleware
// ============================================

// Set security HTTP headers with Content Security Policy allowing portal CDNs & inline handlers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
        styleSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "data:"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://wedonateapp.onrender.com", "http://localhost:5000", "http://127.0.0.1:5000"],
      },
    },
  })
);

// CORS — only allow specified origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://localhost:5000', 'http://127.0.0.1:5000', 'http://localhost:8081', 'https://wedonateapp.onrender.com'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman in dev)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Prevent MongoDB operator injection (e.g. { "$gt": "" } in request body)
app.use(mongoSanitize());

// Apply general rate limiter to all routes
app.use(generalLimiter);

// ============================================
// Body parsing middleware
// ============================================
app.use(express.json({ limit: '10kb' })); // Reject bodies > 10KB
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// ============================================
// HTTP request logging
// ============================================
if (process.env.NODE_ENV !== 'test') {
  // Use morgan for HTTP logging, piped through Winston
  app.use(
    morgan('combined', {
      stream: {
        write: (message) => logger.http(message.trim()),
      },
      // SECURITY: Never log Authorization header values
      skip: false,
    })
  );
}

// ============================================
// Health check endpoint
// GET /api/health
// ============================================
app.get('/api/health', async (req, res) => {
  try {
    // Check MongoDB connection state
    // 1 = connected, anything else = not connected
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? 'connected' : 'disconnected';

    const healthData = {
      status: 'ok',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      db: dbStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };

    // Return 503 if DB is not connected
    if (dbState !== 1) {
      return res.status(503).json({
        success: false,
        ...healthData,
        status: 'degraded',
        message: 'Database not connected',
      });
    }

    return sendSuccess(res, {
      statusCode: 200,
      message: 'WE DONATE API is healthy',
      data: healthData,
    });
  } catch (error) {
    logger.error(`Health check error: ${error.message}`);
    return res.status(503).json({
      success: false,
      status: 'error',
      message: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

const fs = require('fs');

console.log('[PORTAL] Unified portal enabled');
console.log('[PORTAL] __dirname:', __dirname);
console.log('[PORTAL] portal exists:', fs.existsSync(path.join(__dirname, 'portal', 'index.html')));

// ============================================
// Static Web Portals (Unified Management Portal & Legacy Redirects)
// ============================================
const portalPath = path.join(__dirname, 'portal');
const publicPortalPath = path.join(__dirname, 'public', 'portal');
const publicPath = path.join(__dirname, 'public');

// Explicit route handlers for 3 distinct portals
app.get(['/portal/admin', '/portal/admin/', '/portal/admin/index.html'], (req, res) => {
  const targetFile = fs.existsSync(path.join(portalPath, 'admin', 'index.html'))
    ? path.join(portalPath, 'admin', 'index.html')
    : path.join(publicPortalPath, 'admin', 'index.html');
  if (!fs.existsSync(targetFile)) return res.status(404).send('Admin portal file not found');
  return res.sendFile(targetFile);
});

app.get(['/portal/hospital', '/portal/hospital/', '/portal/hospital/index.html'], (req, res) => {
  const targetFile = fs.existsSync(path.join(portalPath, 'hospital', 'index.html'))
    ? path.join(portalPath, 'hospital', 'index.html')
    : path.join(publicPortalPath, 'hospital', 'index.html');
  if (!fs.existsSync(targetFile)) return res.status(404).send('Hospital portal file not found');
  return res.sendFile(targetFile);
});

app.get(['/portal/blood-bank', '/portal/blood-bank/', '/portal/blood-bank/index.html'], (req, res) => {
  const targetFile = fs.existsSync(path.join(portalPath, 'blood-bank', 'index.html'))
    ? path.join(portalPath, 'blood-bank', 'index.html')
    : path.join(publicPortalPath, 'blood-bank', 'index.html');
  if (!fs.existsSync(targetFile)) return res.status(404).send('Blood Bank portal file not found');
  return res.sendFile(targetFile);
});

app.get(['/portal', '/portal/', '/portal/index.html'], (req, res) => {
  const targetFile = fs.existsSync(path.join(portalPath, 'index.html'))
    ? path.join(portalPath, 'index.html')
    : path.join(publicPortalPath, 'index.html');
  if (!fs.existsSync(targetFile)) return res.status(404).send('Portal login hub file not found');
  return res.sendFile(targetFile);
});

// Serve static assets for portals
app.use('/portal', express.static(portalPath));
app.use('/portal', express.static(publicPortalPath));
app.use(express.static(publicPath));

// ============================================
// API Routes
// ============================================
app.use(`/api/${API_VERSION}/auth`, authRoutes);
app.use(`/api/${API_VERSION}/users`, userRoutes);
app.use(`/api/${API_VERSION}/blood-requests`, requestRoutes);
app.use(`/api/${API_VERSION}/requests`, requestRoutes);
app.use(`/api/${API_VERSION}/matches`, matchRoutes);
app.use(`/api/${API_VERSION}/donors`, donorRoutes);
app.use(`/api/${API_VERSION}/notifications`, notificationRoutes);
app.use(`/api/${API_VERSION}/hospitals`, hospitalRoutes);
app.use(`/api/${API_VERSION}/organizations`, organizationRoutes);
app.use(`/api/${API_VERSION}/admin`, adminRoutes);
app.use(`/api/${API_VERSION}/camps`, campRoutes);
app.use(`/api/${API_VERSION}/inventory`, inventoryRoutes);
app.use(`/api/${API_VERSION}/funding`, fundingRoutes);
app.use(`/api/${API_VERSION}/donations`, donationRoutes);
app.use(`/api/${API_VERSION}/payments`, paymentRoutes);

// ============================================
// 404 handler — unknown routes
// ============================================
app.use((req, res) => {
  sendError(res, {
    statusCode: 404,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ============================================
// Centralized error handler — MUST be last
// ============================================
app.use(errorHandler);

const { initFirebaseAdmin } = require('./services/firebaseService');

// ============================================
// Start server
// ============================================
const startServer = async () => {
  try {
    // Connect to MongoDB Atlas first
    await connectDB();

    // Initialize Firebase Admin SDK (we-donate-8170b)
    initFirebaseAdmin();

    // Start listening only after DB is connected
    const server = app.listen(PORT, () => {
      logger.info(`WE DONATE API running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Health check: http://localhost:${PORT}/api/health`);

      // Initialize periodic emergency notification batch processing worker (runs every 60 seconds)
      const { processPendingNotificationBatches } = require('./services/notificationCampaignService');
      setInterval(() => {
        processPendingNotificationBatches().catch((err) => logger.error(`Pending batch worker error: ${err.message}`));
      }, 60 * 1000);
    });

    // ============================================
    // Graceful shutdown
    // ============================================
    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully...`);
      server.close(async () => {
        logger.info('HTTP server closed');
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      // Log but do NOT log sensitive data from reason
      logger.error(`Unhandled promise rejection: ${reason}`);
    });

  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

// Export app for testing (don't call startServer in test environment)
module.exports = app;

// Only start server if this file is run directly (not imported by tests)
if (require.main === module) {
  startServer();
}
