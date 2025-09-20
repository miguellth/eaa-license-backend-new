const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const setupDatabase = async () => {
  try {
    console.log('🔧 Setting up EAA Plugin database...');

    // Create customers table
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

    // Create licenses table (compatible with Stripe webhook handler)
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
    
    // Create indexes for fast lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
      CREATE INDEX IF NOT EXISTS idx_licenses_customer ON licenses(customer_id);
      CREATE INDEX IF NOT EXISTS idx_licenses_subscription ON licenses(subscription_id);
      CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
      CREATE INDEX IF NOT EXISTS idx_licenses_domain ON licenses(domain);
    `);

    // Create license_usage table (updated schema)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS license_usage (
        id SERIAL PRIMARY KEY,
        license_key VARCHAR(50) NOT NULL,
        domain VARCHAR(255),
        action VARCHAR(100),
        timestamp TIMESTAMP DEFAULT NOW(),
        ip_address INET,
        user_agent TEXT
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_usage_license ON license_usage(license_key);
      CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON license_usage(timestamp);
    `);

    // Create webhook_events table (updated schema)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id SERIAL PRIMARY KEY,
        stripe_event_id VARCHAR(255) UNIQUE,
        event_type VARCHAR(100),
        processed_at TIMESTAMP DEFAULT NOW(),
        data JSONB,
        error_message TEXT
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed_at);
    `);

    // Create plugin_configs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plugin_configs (
        id SERIAL PRIMARY KEY,
        license_id INTEGER REFERENCES licenses(id),
        config_data JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Plan features will be handled in the application logic

    // Create indexes for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON licenses(license_key);
      CREATE INDEX IF NOT EXISTS idx_customers_stripe_customer ON customers(stripe_customer_id);
    `);

    console.log('✅ Database setup completed successfully!');
    console.log('📊 Created tables:');
    console.log('   - customers');
    console.log('   - licenses'); 
    console.log('   - license_usage');
    console.log('   - webhook_events');
    console.log('   - plugin_configs');
    console.log('🔍 Created indexes for optimal performance');

    // Insert sample license for testing (optional)
    if (process.env.CREATE_TEST_LICENSE === 'true') {
      console.log('🧪 Creating test license...');
      
      // Insert test license with new schema
      await pool.query(`
        INSERT INTO licenses (
          license_key,
          customer_id,
          email,
          domain,
          plan,
          status,
          expires_at
        ) VALUES (
          'EAA-TEST-1234-ABCD',
          'test-customer-123',
          'test@eaasolutions.de',
          'localhost',
          'pro',
          'active',
          NOW() + INTERVAL '1 year'
        ) ON CONFLICT (license_key) DO NOTHING
      `);
      
      // Insert demo license
      await pool.query(`
        INSERT INTO licenses (
          license_key,
          customer_id,
          email,
          domain,
          plan,
          status,
          expires_at
        ) VALUES (
          'EAA-DEMO-5678-EFGH',
          'demo-customer-456',
          'demo@eaasolutions.de',
          'eaasolutions.de',
          'enterprise',
          'active',
          NOW() + INTERVAL '1 year'
        ) ON CONFLICT (license_key) DO NOTHING
      `);

      console.log('✅ Test licenses created:');
      console.log('   - EAA-TEST-1234-ABCD (Pro plan)');
      console.log('   - EAA-DEMO-5678-EFGH (Enterprise plan)');
    }

  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

// Run setup if called directly
if (require.main === module) {
  setupDatabase();
}

module.exports = { setupDatabase };
