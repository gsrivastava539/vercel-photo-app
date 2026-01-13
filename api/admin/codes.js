/**
 * POST /api/admin/codes
 * Get all verification codes
 */

const db = require('../../lib/db');
const auth = require('../../lib/auth');

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
    
    // Verify token and admin status
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    
    const decoded = auth.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ success: false, message: 'Session expired.' });
    }
    
    const isAdmin = await db.isAdmin(decoded.email);
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required.' });
    }
    
    // Get all codes
    const codes = await db.getAllCodes();
    
    return res.status(200).json({
      success: true,
      codes: codes,
    });
    
  } catch (error) {
    console.error('Get codes error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
  }
};
