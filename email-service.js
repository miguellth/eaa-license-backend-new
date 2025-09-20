const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendCustomerLicenseEmail(customerData, licenseData) {
  try {
    const result = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'noreply@eaasolutions.de',
      to: customerData.email,
      subject: 'Your EAA Plugin License is Ready! 🎉',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin-bottom: 10px;">EAA Solutions</h1>
            <h2 style="color: #059669;">Welcome! Your License is Active 🎉</h2>
          </div>

          <p>Hi ${customerData.name || 'there'},</p>
          <p>Welcome to EAA Solutions! Your accessibility plugin license is now active and ready to use.</p>
          
          <div style="background: #f8fafc; padding: 25px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #2563eb;">
            <h3 style="color: #374151; margin-top: 0;">License Details:</h3>
            <p style="margin: 8px 0;"><strong>License Key:</strong> <code style="background: #e5e7eb; padding: 6px 12px; border-radius: 4px; font-family: 'Courier New', monospace;">${licenseData.license_key}</code></p>
            <p style="margin: 8px 0;"><strong>Plan:</strong> ${licenseData.plan.charAt(0).toUpperCase() + licenseData.plan.slice(1)} (€${getPlanPrice(licenseData.plan)}/month)</p>
            <p style="margin: 8px 0;"><strong>Status:</strong> <span style="color: #059669; font-weight: bold;">Active ✅</span></p>
            <p style="margin: 8px 0;"><strong>Expires:</strong> ${new Date(licenseData.expires_at).toLocaleDateString('de-DE')}</p>
          </div>

          <div style="background: #ecfdf5; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <h3 style="color: #065f46; margin-top: 0;">🔧 Get Started:</h3>
            <ol style="color: #374151; line-height: 1.6;">
              <li>Download the EAA Plugin from your dashboard</li>
              <li>Install on your website</li>
              <li>Enter your license key</li>
              <li>Start improving accessibility!</li>
            </ol>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://eaa-license-backend-production.up.railway.app/install-guide" 
               style="background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              📖 Installation Guide
            </a>
          </div>

          <div style="background: #fffbeb; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #f59e0b;">
            <h3 style="color: #92400e; margin-top: 0;">💬 Need Help?</h3>
            <p style="color: #374151; margin: 8px 0;">Contact our support team:</p>
            <p style="margin: 8px 0;">✉️ <a href="mailto:contact@eaasolutions.de" style="color: #2563eb;">contact@eaasolutions.de</a></p>
          </div>

          <div style="border-top: 2px solid #e5e7eb; padding-top: 20px; margin-top: 30px; color: #6b7280; font-size: 14px;">
            <p>Best regards,</p>
            <p><strong>Miguel Lieberwirth</strong><br>
            Founder, EAA Solutions<br>
            <a href="mailto:contact@eaasolutions.de" style="color: #2563eb;">contact@eaasolutions.de</a></p>
            
            <p style="font-size: 12px; margin-top: 20px;">
              This email was sent because you purchased an EAA Plugin license. 
              Your license key is: <strong>${licenseData.license_key}</strong>
            </p>
          </div>
        </div>
      `
    });
    
    console.log('✅ Customer license email sent:', result);
    return result;
  } catch (error) {
    console.error('❌ Failed to send customer email:', error);
    throw error;
  }
}

async function sendBusinessNotification(customerData, licenseData, paymentData) {
  try {
    const result = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'noreply@eaasolutions.de',
      to: process.env.BUSINESS_EMAIL || 'miguellieberwirth@freenet.de',
      subject: `💰 New EAA Purchase - €${paymentData.amount} [${licenseData.plan.toUpperCase()}]`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #ecfdf5; padding: 20px; border-radius: 8px; border-left: 4px solid #059669;">
            <h2 style="color: #065f46; margin-top: 0;">💰 New Purchase Alert!</h2>
            <p style="color: #047857; font-size: 18px; font-weight: bold;">
              You just made €${paymentData.amount}! 🎉
            </p>
          </div>

          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #374151; margin-top: 0;">Customer Details:</h3>
            <p><strong>Email:</strong> ${customerData.email}</p>
            <p><strong>Name:</strong> ${customerData.name || 'Not provided'}</p>
            <p><strong>Plan:</strong> ${licenseData.plan.charAt(0).toUpperCase() + licenseData.plan.slice(1)}</p>
            <p><strong>Amount:</strong> <strong>€${paymentData.amount}</strong></p>
            <p><strong>License Key:</strong> <code>${licenseData.license_key}</code></p>
            <p><strong>Time:</strong> ${new Date().toLocaleString('de-DE')}</p>
          </div>

          <div style="text-align: center; margin: 25px 0;">
            <a href="https://eaa-license-backend-production.up.railway.app/admin" 
               style="background: #2563eb; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              🔧 View in Admin Dashboard
            </a>
          </div>

          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            🤖 Automated notification from EAA License System<br>
            📧 Sent to: miguellieberwirth@freenet.de
          </p>
        </div>
      `
    });
    
    console.log('✅ Business notification sent to Miguel:', result);
    return result;
  } catch (error) {
    console.error('❌ Failed to send business notification:', error);
  }
}

function getPlanPrice(plan) {
  const prices = {
    'starter': '29',
    'pro': '49', 
    'plus': '99'
  };
  return prices[plan] || '29';
}

module.exports = {
  sendCustomerLicenseEmail,
  sendBusinessNotification
};
