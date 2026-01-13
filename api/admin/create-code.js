/**
 * POST /api/admin/create-code
 * Create a new verification code with Dropbox folder
 */

const db = require('../../lib/db');
const auth = require('../../lib/auth');
const dropbox = require('../../lib/dropbox');

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
    
    // Generate unique 6-digit code
    const verificationCode = await db.generateUniqueCode();
    
    // Create Dropbox folder and get shared link
    const dropboxResult = await dropbox.createFolderWithLink(verificationCode);
    
    if (!dropboxResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create Dropbox folder: ' + dropboxResult.error,
      });
    }
    
    // Add to database
    await db.addNewCode(verificationCode, dropboxResult.sharedLink);
    
    return res.status(200).json({
      success: true,
      code: verificationCode,
      dropboxLink: dropboxResult.sharedLink,
      folderPath: dropboxResult.folderPath,
      message: 'Code created successfully!',
    });
    
  } catch (error) {
    console.error('Create code error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
  }
};
