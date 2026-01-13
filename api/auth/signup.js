/**
 * POST /api/auth/signup
 * Create a new user account
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
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }
    
    // Format email
    const fullEmail = email.toLowerCase().trim() + '@gmail.com';
    
    // Validate password
    const passwordValidation = auth.validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ success: false, message: passwordValidation.message });
    }
    
    // Check if account exists
    const existingAccount = await db.findAccountByEmail(fullEmail);
    if (existingAccount) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
    }
    
    // Hash password and create account
    const hashedPassword = await auth.hashPassword(password);
    await db.createAccount(fullEmail, hashedPassword);
    
    // Check if user is admin
    const isAdmin = await db.isAdmin(fullEmail);
    
    return res.status(200).json({
      success: true,
      message: 'Account created successfully! You can now log in.',
      email: fullEmail,
      isAdmin: isAdmin,
    });
    
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
  }
};
