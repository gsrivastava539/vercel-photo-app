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
    console.log('Signup request received:', JSON.stringify(req.body));
    
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      console.log('Missing email or password');
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }
    
    // Format email - accept full email address
    const fullEmail = email.toLowerCase().trim();
    console.log('Processing signup for:', fullEmail);
    
    // Validate email format
    if (!auth.validateEmail(fullEmail)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }
    
    // Validate password
    const passwordValidation = auth.validatePassword(password);
    if (!passwordValidation.valid) {
      console.log('Password validation failed:', passwordValidation.message);
      return res.status(400).json({ success: false, message: passwordValidation.message });
    }
    
    // Check if account exists
    console.log('Checking if account exists...');
    const existingAccount = await db.findAccountByEmail(fullEmail);
    if (existingAccount) {
      console.log('Account already exists');
      return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
    }
    
    // Hash password and create account
    console.log('Creating account...');
    const hashedPassword = await auth.hashPassword(password);
    await db.createAccount(fullEmail, hashedPassword);
    console.log('Account created successfully');
    
    // Check if user is admin
    const isAdmin = await db.isAdmin(fullEmail);
    console.log('Is admin:', isAdmin);
    
    return res.status(200).json({
      success: true,
      message: 'Account created successfully! You can now log in.',
      email: fullEmail,
      isAdmin: isAdmin,
    });
    
  } catch (error) {
    console.error('Signup error:', error.message);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      success: false, 
      message: 'An error occurred. Please try again.',
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
