/**
 * POST /api/auth/forgot
 * Send password reset email
 */

const db = require('../../lib/db');
const auth = require('../../lib/auth');
const email = require('../../lib/email');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  
  try {
    const { email: userEmail } = req.body;
    
    if (!userEmail) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }
    
    // Format email - accept full email address
    const fullEmail = userEmail.toLowerCase().trim();
    
    // Always return success to not reveal if account exists
    const successMessage = 'If an account exists, a reset link has been sent.';
    
    // Find account
    const account = await db.findAccountByEmail(fullEmail);
    if (!account) {
      return res.status(200).json({ success: true, message: successMessage });
    }
    
    // Generate reset token
    const resetToken = auth.generateResetToken();
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 1); // 1 hour expiry
    
    // Save token to database
    await db.setResetToken(account.id, resetToken, expiry.toISOString());
    
    // Get base URL from request
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'];
    const baseUrl = `${protocol}://${host}`;
    const resetLink = `${baseUrl}/reset?token=${resetToken}`;
    
    // Send reset email
    await email.sendResetEmail(fullEmail, resetLink);
    
    return res.status(200).json({ success: true, message: successMessage });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
  }
};
