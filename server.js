const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const jwt = require('jsonwebtoken');
const winston = require('winston');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable trust proxy - needed for Railway deployment
app.set('trust proxy', 1);

// Logging setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database on startup
const initializeDatabase = async () => {
  try {
    console.log('🔧 Initializing database...');
    
    // Create licenses table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS licenses (
        id SERIAL PRIMARY KEY,
        license_key VARCHAR(50) UNIQUE NOT NULL,
        customer_id VARCHAR(255),
        subscription_id VARCHAR(255),
        email VARCHAR(255) NOT NULL,
        domain VARCHAR(255),
        plan VARCHAR(50) NOT NULL DEFAULT 'starter',
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP,
        last_used TIMESTAMP,
        usage_count INTEGER DEFAULT 0
      )
    `);
    
    // Create other essential tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        stripe_customer_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
  }
};

// Initialize database on startup
initializeDatabase();

// Middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) }}));

// Rate limiting - configure for Railway proxy
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  trustProxy: true, // Trust Railway proxy
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'https://yourdomain.com'],
  credentials: true
}));

// Body parsing - webhook needs raw body parser first
app.use('/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Import routes
const stripeWebhookRoute = require('./routes/stripe-webhook');
const licenseRoute = require('./routes/license');

// Routes
app.use('/stripe', stripeWebhookRoute);
app.use('/api/license', licenseRoute);

// Health check - basic check without database
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'eaa-plugin-api',
    version: process.env.PLUGIN_VERSION || '1.0.0'
  });
});

// Database health check
app.get('/health-db', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'database-healthy', 
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Database health check failed:', error);
    res.status(503).json({ 
      status: 'database-unhealthy', 
      error: error.message
    });
  }
});

// Routes now handled by separate route files
// - /stripe/webhook -> routes/stripe-webhook.js
// - /api/license/* -> routes/license.js
// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  logger.info(`EAA Plugin API server running on port ${PORT}`);
  console.log(`🚀 Server started on http://localhost:${PORT}`);
});

module.exports = app;
