const { sendCustomerLicenseEmail, sendBusinessNotification } = require('../email-service');
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Stripe webhook handler
router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        console.log('✅ Webhook signature verified');
    } catch (err) {
        console.error('❌ Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log('📨 Received webhook:', event.type);

    try {
        switch (event.type) {
            case 'checkout.session.completed':
                await handleSuccessfulPayment(event.data.object);
                break;
            
            case 'invoice.payment_succeeded':
                await handleSubscriptionRenewal(event.data.object);
                break;
            
            case 'customer.subscription.deleted':
            case 'customer.subscription.canceled':
                await handleSubscriptionCancellation(event.data.object);
                break;
            
            case 'invoice.payment_failed':
                await handlePaymentFailure(event.data.object);
                break;
            
            default:
                console.log(`🤷 Unhandled event type: ${event.type}`);
        }
        
        res.json({received: true});
    } catch (error) {
        console.error('❌ Webhook processing error:', error);
        res.status(500).json({error: 'Webhook processing failed'});
    }
});

// Handle successful payment (new subscription)
async function handleSuccessfulPayment(session) {
    console.log('💳 Processing successful payment:', session.id);
    
    try {
        // Get subscription details
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const customer = await stripe.customers.retrieve(session.customer);
        
        // Extract domain from metadata or customer email
        const domain = session.metadata?.domain || extractDomainFromEmail(customer.email);
        const plan = getPlanFromPriceId(subscription.items.data[0].price.id);
        
        // Generate license key
        const licenseKey = generateLicenseKey();
        
        // Store license in database
        const client = await pool.connect();
        try {
            await client.query(`
                INSERT INTO licenses (
                    license_key, 
                    customer_id, 
                    subscription_id,
                    email,
                    domain, 
                    plan, 
                    status, 
                    created_at, 
                    expires_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
                ON CONFLICT (customer_id) 
                DO UPDATE SET 
                    license_key = $1,
                    subscription_id = $3,
                    plan = $6,
                    status = $7,
                    expires_at = $8,
                    updated_at = NOW()
            `, [
                licenseKey,
                session.customer,
                session.subscription,
                customer.email,
                domain,
                plan,
                'active',
                new Date(subscription.current_period_end * 1000)
            ]);
            
            console.log('✅ License created:', licenseKey);
            
            // Send license key email (optional - you can implement this later)
            await sendLicenseEmail(customer.email, licenseKey, domain, plan);
            
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('❌ Error processing payment:', error);
        throw error;
    }
}

// Handle subscription renewal
async function handleSubscriptionRenewal(invoice) {
    console.log('🔄 Processing subscription renewal:', invoice.subscription);
    
    const client = await pool.connect();
    try {
        // Extend license expiration
        await client.query(`
            UPDATE licenses 
            SET expires_at = $1, status = 'active', updated_at = NOW()
            WHERE subscription_id = $2
        `, [
            new Date(invoice.lines.data[0].period.end * 1000),
            invoice.subscription
        ]);
        
        console.log('✅ License renewed for subscription:', invoice.subscription);
        
    } finally {
        client.release();
    }
}

// Handle subscription cancellation
async function handleSubscriptionCancellation(subscription) {
    console.log('❌ Processing subscription cancellation:', subscription.id);
    
    const client = await pool.connect();
    try {
        await client.query(`
            UPDATE licenses 
            SET status = 'cancelled', updated_at = NOW()
            WHERE subscription_id = $1
        `, [subscription.id]);
        
        console.log('✅ License cancelled for subscription:', subscription.id);
        
    } finally {
        client.release();
    }
}

// Handle payment failure
async function handlePaymentFailure(invoice) {
    console.log('💸 Processing payment failure:', invoice.subscription);
    
    const client = await pool.connect();
    try {
        await client.query(`
            UPDATE licenses 
            SET status = 'payment_failed', updated_at = NOW()
            WHERE subscription_id = $1
        `, [invoice.subscription]);
        
        console.log('⚠️ License suspended due to payment failure:', invoice.subscription);
        
    } finally {
        client.release();
    }
}

// Generate unique license key
function generateLicenseKey() {
    const segments = [];
    for (let i = 0; i < 4; i++) {
        segments.push(Math.random().toString(36).substr(2, 4).toUpperCase());
    }
    return `EAA-${segments.join('-')}`;
}

// Map Stripe price ID to plan name
function getPlanFromPriceId(priceId) {
    // You'll need to update these with your actual Stripe Price IDs
    const priceMapping = {
        [process.env.STRIPE_PRICE_STARTER]: 'starter',
        [process.env.STRIPE_PRICE_PRO]: 'pro', 
        [process.env.STRIPE_PRICE_ENTERPRISE]: 'enterprise'
    };
    
    return priceMapping[priceId] || 'starter';
}

// Extract domain from email (fallback if no domain in metadata)
function extractDomainFromEmail(email) {
    const domain = email.split('@')[1];
    return domain || 'unknown.com';
}

// Send license key email (basic implementation)
async function sendLicenseEmail(email, licenseKey, domain, plan) {
    console.log(`📧 Would send license email to: ${email}`);
    console.log(`License: ${licenseKey}, Domain: ${domain}, Plan: ${plan}`);
    
    // TODO: Implement email sending (NodeMailer, SendGrid, etc.)
    // For now, just log the information
}

module.exports = router;
