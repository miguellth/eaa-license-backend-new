const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Validate license endpoint - called by the plugin
router.post('/validate', async (req, res) => {
    const { licenseKey, domain } = req.body;
    
    if (!licenseKey) {
        return res.status(400).json({ 
            valid: false, 
            error: 'License key is required' 
        });
    }

    if (!domain) {
        return res.status(400).json({ 
            valid: false, 
            error: 'Domain is required' 
        });
    }

    try {
        const client = await pool.connect();
        
        try {
            // Find license in database
            const result = await client.query(`
                SELECT * FROM licenses 
                WHERE license_key = $1 
                AND status = 'active'
            `, [licenseKey]);

            if (result.rows.length === 0) {
                return res.json({ 
                    valid: false, 
                    error: 'Invalid or inactive license key' 
                });
            }

            const license = result.rows[0];

            // Check if license has expired
            if (license.expires_at < new Date()) {
                // Update status to expired
                await client.query(`
                    UPDATE licenses 
                    SET status = 'expired', updated_at = NOW()
                    WHERE license_key = $1
                `, [licenseKey]);

                return res.json({ 
                    valid: false, 
                    error: 'License has expired' 
                });
            }

            // Get domain from license or check if domain matches
            const licensedDomain = license.domain;
            const normalizedRequestDomain = normalizeDomain(domain);
            const normalizedLicenseDomain = normalizeDomain(licensedDomain);

            // Allow if domains match or if license domain is generic
            const domainMatches = normalizedLicenseDomain === normalizedRequestDomain || 
                                licensedDomain === 'unknown.com' || 
                                licensedDomain.includes(normalizedRequestDomain);

            if (!domainMatches) {
                return res.json({ 
                    valid: false, 
                    error: `License not valid for domain: ${domain}` 
                });
            }

            // Update last used timestamp
            await client.query(`
                UPDATE licenses 
                SET last_used = NOW(), usage_count = usage_count + 1
                WHERE license_key = $1
            `, [licenseKey]);

            // Get license features based on plan
            const features = getLicenseFeatures(license.plan);

            // Return valid license with features
            res.json({
                valid: true,
                license: {
                    key: licenseKey,
                    plan: license.plan,
                    features: features,
                    expiresAt: license.expires_at,
                    domain: licensedDomain,
                    customer: {
                        email: license.email
                    }
                }
            });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('❌ License validation error:', error);
        res.status(500).json({ 
            valid: false, 
            error: 'Internal server error' 
        });
    }
});

// Get license info endpoint (for admin dashboard)
router.get('/info/:licenseKey', async (req, res) => {
    const { licenseKey } = req.params;
    
    try {
        const client = await pool.connect();
        
        try {
            const result = await client.query(`
                SELECT 
                    license_key,
                    email,
                    domain,
                    plan,
                    status,
                    created_at,
                    expires_at,
                    last_used,
                    usage_count
                FROM licenses 
                WHERE license_key = $1
            `, [licenseKey]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'License not found' });
            }

            const license = result.rows[0];
            const features = getLicenseFeatures(license.plan);

            res.json({
                license: {
                    ...license,
                    features
                }
            });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('❌ License info error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// List all licenses endpoint (for admin)
router.get('/all', async (req, res) => {
    try {
        const client = await pool.connect();
        
        try {
            const result = await client.query(`
                SELECT 
                    license_key,
                    email,
                    domain,
                    plan,
                    status,
                    created_at,
                    expires_at,
                    last_used,
                    usage_count
                FROM licenses 
                ORDER BY created_at DESC
                LIMIT 100
            `);

            const licenses = result.rows.map(license => ({
                ...license,
                features: getLicenseFeatures(license.plan)
            }));

            res.json({ licenses });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('❌ License list error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create manual license endpoint (for testing)
router.post('/create-manual', async (req, res) => {
    const { email, domain, plan = 'starter' } = req.body;
    
    if (!email || !domain) {
        return res.status(400).json({ error: 'Email and domain are required' });
    }

    try {
        const licenseKey = generateLicenseKey();
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1); // 1 month from now

        const client = await pool.connect();
        
        try {
            await client.query(`
                INSERT INTO licenses (
                    license_key,
                    customer_id,
                    email,
                    domain,
                    plan,
                    status,
                    created_at,
                    expires_at
                ) VALUES ($1, $2, $3, $4, $5, 'active', NOW(), $6)
            `, [licenseKey, `manual-${Date.now()}`, email, domain, plan, expiresAt]);

            console.log('✅ Manual license created:', licenseKey);

            res.json({
                success: true,
                license: {
                    key: licenseKey,
                    email,
                    domain,
                    plan,
                    expiresAt,
                    features: getLicenseFeatures(plan)
                }
            });

        } finally {
            client.release();
        }

    } catch (error) {
        console.error('❌ Manual license creation error:', error);
        res.status(500).json({ error: 'Failed to create license' });
    }
});

// Helper function to normalize domain names
function normalizeDomain(domain) {
    if (!domain) return '';
    
    return domain
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/$/, '')
        .split('/')[0];
}

// Helper function to generate license key
function generateLicenseKey() {
    const segments = [];
    for (let i = 0; i < 4; i++) {
        segments.push(Math.random().toString(36).substr(2, 4).toUpperCase());
    }
    return `EAA-${segments.join('-')}`;
}

// Get features based on plan
function getLicenseFeatures(plan) {
    const features = {
        starter: {
            scanning: true,
            basic_fixes: true,
            advanced_fixes: false,
            widget: true,
            max_scans_per_month: 100,
            max_websites: 1,
            priority_support: false,
            api_access: false,
            white_label: false,
            detailed_reports: false
        },
        pro: {
            scanning: true,
            basic_fixes: true,
            advanced_fixes: true,
            widget: true,
            max_scans_per_month: 500,
            max_websites: 3,
            priority_support: true,
            api_access: false,
            white_label: false,
            detailed_reports: true
        },
        enterprise: {
            scanning: true,
            basic_fixes: true,
            advanced_fixes: true,
            widget: true,
            max_scans_per_month: -1, // unlimited
            max_websites: -1, // unlimited
            priority_support: true,
            api_access: true,
            white_label: true,
            detailed_reports: true
        }
    };
    
    return features[plan] || features.starter;
}

module.exports = router;
