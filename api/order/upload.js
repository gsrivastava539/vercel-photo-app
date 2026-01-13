/**
 * POST /api/order/upload
 * Upload photo to user's Dropbox folder and create order
 */

const db = require('../../lib/db');
const auth = require('../../lib/auth');

const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  
  try {
    const { token, fileName, fileData } = req.body;
    
    // Verify token
    const decoded = auth.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ success: false, message: 'Session expired.' });
    }
    
    const userEmail = decoded.email;
    const sanitizedEmail = userEmail.replace(/[^a-zA-Z0-9]/g, '_');
    const folderPath = `/UserPhotos/${sanitizedEmail}`;
    
    // Create user folder in Dropbox
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
      // Folder might already exist, that's okay
    }
    
    // Upload file to Dropbox
    const base64Data = fileData.split(',')[1]; // Remove data:image/xxx;base64, prefix
    const fileBuffer = Buffer.from(base64Data, 'base64');
    const timestamp = Date.now();
    const filePath = `${folderPath}/${timestamp}_${fileName}`;
    
    const uploadRes = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path: filePath,
          mode: 'add',
          autorename: true,
          mute: false,
        }),
      },
      body: fileBuffer,
    });
    
    if (!uploadRes.ok) {
      const error = await uploadRes.json();
      console.error('Dropbox upload error:', error);
      return res.status(500).json({ success: false, message: 'Failed to upload photo.' });
    }
    
    // Create shared link for the folder
    let sharedLink = '';
    try {
      const linkRes = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: folderPath,
          settings: { requested_visibility: 'public' },
        }),
      });
      
      if (linkRes.ok) {
        const linkData = await linkRes.json();
        sharedLink = linkData.url;
      } else {
        // Try to get existing link
        const existingRes = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path: folderPath, direct_only: true }),
        });
        
        if (existingRes.ok) {
          const existingData = await existingRes.json();
          if (existingData.links && existingData.links.length > 0) {
            sharedLink = existingData.links[0].url;
          }
        }
      }
    } catch (e) {
      console.error('Error creating shared link:', e);
    }
    
    // Create order in database
    const supabase = db.getSupabase();
    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        user_email: userEmail,
        status: 'pending',
        dropbox_folder: folderPath,
        dropbox_link: sharedLink,
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating order:', error);
      return res.status(500).json({ success: false, message: 'Failed to create order.' });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Photo uploaded successfully!',
      order: order,
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred.' });
  }
};

