/**
 * POST /api/auth/verify
 * Verify JWT token
 */

const auth = require('../../lib/auth');
const db = require('../../lib/db');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ valid: false, message: 'Token is required.' });
    }
    
    // Verify token
    const decoded = auth.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ valid: false, message: 'Invalid or expired token.' });
    }
    
    // Re-check admin status (in case it changed)
    const isAdmin = await db.isAdmin(decoded.email);
    
    return res.status(200).json({
      valid: true,
      email: decoded.email,
      isAdmin: isAdmin,
    });
    
  } catch (error) {
    console.error('Verify error:', error);
    return res.status(500).json({ valid: false, message: 'An error occurred.' });
  }
};
