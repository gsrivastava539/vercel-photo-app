/**
 * POST /api/auth/login
 * Login user and return JWT token
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
    
    // Format email - accept full email address
    const fullEmail = email.toLowerCase().trim();
    
    // Find account
    const account = await db.findAccountByEmail(fullEmail);
    if (!account) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    
    // Verify password
    const isValidPassword = await auth.comparePassword(password, account.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    
    // Check if user is admin
    const isAdmin = await db.isAdmin(fullEmail);
    
    // Generate JWT token
    const token = auth.generateToken({
      email: fullEmail,
      isAdmin: isAdmin,
    });
    
    return res.status(200).json({
      success: true,
      message: 'Login successful!',
      email: fullEmail,
      token: token,
      isAdmin: isAdmin,
    });
    
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
  }
};
