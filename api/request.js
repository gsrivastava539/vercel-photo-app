/**
 * POST /api/request
 * Process photo request
 */

const db = require('../lib/db');
const auth = require('../lib/auth');
const dropbox = require('../lib/dropbox');
const email = require('../lib/email');

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
    const { token, code } = req.body;
    
    // Verify token
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required.', sessionExpired: true });
    }
    
    const decoded = auth.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.', sessionExpired: true });
    }
    
    const userEmail = decoded.email;
    
    // Validate code
    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Please enter your code.' });
    }
    
    // Find matching validation code
    const codeEntry = await db.findCodeByValidation(code.trim());
    
    if (!codeEntry) {
      return res.status(400).json({ success: false, message: 'Code not valid. Please reach out to us on WhatsApp.' });
    }
    
    // Check if code was already used
    if (codeEntry.isUsed) {
      return res.status(400).json({ success: false, message: 'This code has already been used. Please reach out to us on WhatsApp.' });
    }
    
    // Check if dropbox link exists
    if (!codeEntry.dropboxLink) {
      return res.status(400).json({ success: false, message: 'Download link not configured. Please contact support.' });
    }
    
    // Mark code as used
    await db.markCodeUsed(codeEntry.id, userEmail);
    
    // Get direct download link
    const downloadLink = dropbox.getDirectDownloadLink(codeEntry.dropboxLink);
    
    // Send email with download link
    await email.sendPhotoEmail(userEmail, downloadLink, code.trim());
    
    return res.status(200).json({
      success: true,
      message: 'Success! The digital photo link has been sent to your email.',
      dropboxLink: downloadLink,
    });
    
  } catch (error) {
    console.error('Request error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred. Please try again later.' });
  }
};
