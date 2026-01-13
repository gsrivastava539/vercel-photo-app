/**
 * POST /api/admin/clear-all
 * Delete all Dropbox folders and clear all codes from database
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
    
    // Get all codes first (for Dropbox folder deletion)
    const codes = await db.clearAllCodes();
    
    // Delete Dropbox folders
    let deletedFolders = 0;
    let failedFolders = 0;
    
    for (const code of codes) {
      if (code.validationCode) {
        const result = await dropbox.deleteFolder(code.validationCode);
        if (result.success) {
          deletedFolders++;
        } else {
          failedFolders++;
        }
      }
    }
    
    return res.status(200).json({
      success: true,
      message: `All data cleared! Deleted ${deletedFolders} Dropbox folders.${failedFolders > 0 ? ` (${failedFolders} folders failed to delete)` : ''}`,
      deletedFolders: deletedFolders,
      failedFolders: failedFolders,
    });
    
  } catch (error) {
    console.error('Clear all error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
  }
};
