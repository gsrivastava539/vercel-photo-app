/**
 * POST /api/auth
 * Consolidated auth endpoint - handles signup, login, forgot, reset, verify
 */

const db = require('../lib/db');
const authLib = require('../lib/auth');
const { Resend } = require('resend');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  
  const { action } = req.body;
  
  try {
    switch (action) {
      case 'google-signin':
        return await handleGoogleSignIn(req, res);
      case 'verify':
        return await handleVerify(req, res);
      default:
        return res.status(400).json({ success: false, message: 'Invalid action' });
    }
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred.' });
  }
};

const ADMIN_EMAIL = 'studentone.qa@gmail.com';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// Verify Google ID token
async function verifyGoogleToken(credential) {
  try {
    // Decode the JWT to get user info (Google's client library handles verification)
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    
    if (!response.ok) {
      throw new Error('Invalid token');
    }
    
    const payload = await response.json();
    
    // Verify the token is for our app
    if (payload.aud !== GOOGLE_CLIENT_ID) {
      throw new Error('Token not for this app');
    }
    
    return {
      email: payload.email.toLowerCase(),
      name: payload.name || '',
      picture: payload.picture || '',
      emailVerified: payload.email_verified === 'true'
    };
  } catch (error) {
    console.error('Google token verification error:', error);
    return null;
  }
}

async function handleGoogleSignIn(req, res) {
  const { credential } = req.body;
  
  if (!credential) {
    return res.status(400).json({ success: false, message: 'Google credential is required.' });
  }
  
  // Verify Google token
  const googleUser = await verifyGoogleToken(credential);
  
  if (!googleUser) {
    return res.status(401).json({ success: false, message: 'Invalid Google sign-in. Please try again.' });
  }
  
  const email = googleUser.email;
  const isAdmin = await db.isAdmin(email);
  
  // Check if user exists
  let account = await db.findAccountByEmail(email);
  
  if (!account) {
    // New user - create account
    account = await db.createGoogleAccount(email, googleUser.name, googleUser.picture);
    
    // Send notification email to admin about new user
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'];
    
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Digital Photo <noreply@parallaxbay.com>',
        to: [ADMIN_EMAIL],
        subject: '🆕 New User Needs Approval - Digital Photo',
        html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <h2 style="color: #f59e0b; margin: 0 0 20px; text-align: center;">🆕 New User Needs Approval</h2>
      <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #f59e0b;">
        <p style="margin: 0; font-size: 14px; color: #92400e;">Email Address:</p>
        <p style="margin: 4px 0 0; font-size: 18px; font-weight: 600; color: #78350f;">${email}</p>
        ${googleUser.name ? `<p style="margin: 8px 0 0; font-size: 14px; color: #92400e;">Name: ${googleUser.name}</p>` : ''}
      </div>
      <p style="margin: 0 0 20px; color: #64748b; font-size: 14px; text-align: center;">
        Signed up via Google at: ${new Date().toLocaleString()}
      </p>
      <div style="text-align: center;">
        <a href="${protocol}://${host}/admin" style="background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Go to Admin Panel</a>
      </div>
      <p style="margin: 16px 0 0; color: #94a3b8; font-size: 12px; text-align: center;">Review and approve this user in the Pending Users tab.</p>
    </div>
  </div>
</body>
</html>
        `,
      });
    } catch (emailError) {
      console.error('Failed to send admin notification:', emailError);
    }
    
    return res.status(200).json({
      success: true,
      isNewUser: true,
      email: email,
      message: 'Account created! You will receive a confirmation email once approved.',
    });
  }
  
  // Existing user - check if approved (admins bypass)
  if (!isAdmin && !account.admin_approved) {
    return res.status(200).json({
      success: true,
      pendingApproval: true,
      email: email,
      message: 'Your account is pending approval.',
    });
  }
  
  // Approved user or admin - generate token
  const token = authLib.generateToken({ email: email, isAdmin: isAdmin });
  
  return res.status(200).json({
    success: true,
    message: 'Login successful!',
    email: email,
    token: token,
    isAdmin: isAdmin,
  });
}

async function handleVerify(req, res) {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ valid: false, message: 'Token is required.' });
  }
  
  const decoded = authLib.verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ valid: false, message: 'Invalid or expired token.' });
  }
  
  const isAdmin = await db.isAdmin(decoded.email);
  
  return res.status(200).json({ valid: true, email: decoded.email, isAdmin: isAdmin });
}

