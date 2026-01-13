/**
 * POST /api/auth/reset
 * Reset password with token
 */

const db = require('../../lib/db');
const auth = require('../../lib/auth');

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
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and password are required.' });
    }
    
    // Validate password
    const passwordValidation = auth.validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ success: false, message: passwordValidation.message });
    }
    
    // Find account with this token
    const account = await db.findAccountByResetToken(token);
    
    if (!account) {
      return res.status(400).json({ success: false, message: 'Invalid reset link.' });
    }
    
    // Check if token expired
    if (new Date() > new Date(account.token_expiry)) {
      return res.status(400).json({ success: false, message: 'Reset link has expired.' });
    }
    
    // Hash new password and update
    const hashedPassword = await auth.hashPassword(password);
    await db.updateAccountPassword(account.id, hashedPassword);
    
    return res.status(200).json({
      success: true,
      message: 'Password reset successfully! You can now log in.',
    });
    
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
  }
};
