/**
 * POST /api/admin
 * Consolidated admin endpoint - handles create-code, codes, clear-all
 */

const db = require('../lib/db');
const authLib = require('../lib/auth');

const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  
  const { action, token } = req.body;
  
  // Verify admin
  const decoded = authLib.verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, message: 'Session expired.' });
  }
  
  const isAdmin = await db.isAdmin(decoded.email);
  if (!isAdmin) {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  
  try {
    switch (action) {
      case 'create-code':
        return await handleCreateCode(req, res);
      case 'codes':
        return await handleGetCodes(req, res);
      case 'clear-all':
        return await handleClearAll(req, res);
      default:
        return res.status(400).json({ success: false, message: 'Invalid action' });
    }
  } catch (error) {
    console.error('Admin error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred.' });
  }
};

async function handleCreateCode(req, res) {
  const verificationCode = await db.generateUniqueCode();
  
  // Create Dropbox folder
  const folderPath = `/PhotoRequests/${verificationCode}`;
  
  try {
    await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: folderPath, autorename: false }),
    });
  } catch (e) {
    console.error('Error creating folder:', e);
  }
  
  // Create shared link
  let sharedLink = '';
  try {
    const linkRes = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: folderPath, settings: { requested_visibility: 'public' } }),
    });
    
    if (linkRes.ok) {
      const linkData = await linkRes.json();
      sharedLink = linkData.url;
    }
  } catch (e) {
    console.error('Error creating link:', e);
  }
  
  await db.addNewCode(verificationCode, sharedLink);
  
  return res.status(200).json({
    success: true,
    code: verificationCode,
    dropboxLink: sharedLink,
    folderPath: folderPath,
    message: 'Code created successfully!',
  });
}

async function handleGetCodes(req, res) {
  const codes = await db.getAllCodes();
  return res.status(200).json({ success: true, codes: codes });
}

async function handleClearAll(req, res) {
  const codes = await db.clearAllCodes();
  
  let deletedFolders = 0;
  for (const code of codes) {
    if (code.validationCode) {
      try {
        await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path: `/PhotoRequests/${code.validationCode}` }),
        });
        deletedFolders++;
      } catch (e) {}
    }
  }
  
  return res.status(200).json({
    success: true,
    message: `All data cleared! Deleted ${deletedFolders} folders.`,
  });
}

