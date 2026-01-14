/**
 * POST /api/admin
 * Consolidated admin endpoint - handles create-code, codes, clear-all
 */

const db = require('../lib/db');
const authLib = require('../lib/auth');
const dropbox = require('../lib/dropbox');
const email = require('../lib/email');

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
      case 'all-orders':
        return await handleGetAllOrders(req, res);
      case 'update-pickup':
        return await handleUpdatePickup(req, res);
      case 'user-count':
        return await handleUserCount(req, res);
      case 'send-ready-email':
        return await handleSendReadyEmail(req, res);
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
  await dropbox.createFolder(folderPath);
  
  // Create shared link
  let sharedLink = '';
  const linkResult = await dropbox.createSharedLink(folderPath);
  if (linkResult.success) {
    sharedLink = linkResult.url;
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
      const result = await dropbox.deleteFolder(`/PhotoRequests/${code.validationCode}`);
      if (result.success) deletedFolders++;
    }
  }
  
  return res.status(200).json({
    success: true,
    message: `All data cleared! Deleted ${deletedFolders} folders.`,
  });
}

async function handleGetAllOrders(req, res) {
  const supabase = db.getSupabase();
  
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching orders:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch orders.' });
  }
  
  return res.status(200).json({ success: true, orders: orders || [] });
}

async function handleUpdatePickup(req, res) {
  const { orderId, pickupInstructions } = req.body;
  
  if (!orderId) {
    return res.status(400).json({ success: false, message: 'Order ID is required.' });
  }
  
  const supabase = db.getSupabase();
  
  const { data, error } = await supabase
    .from('orders')
    .update({ pickup_instructions: pickupInstructions || null })
    .eq('id', orderId)
    .select()
    .single();
  
  if (error) {
    console.error('Error updating pickup instructions:', error);
    return res.status(500).json({ success: false, message: 'Failed to update instructions.' });
  }
  
  return res.status(200).json({ success: true, message: 'Instructions updated!', order: data });
}

async function handleUserCount(req, res) {
  const supabase = db.getSupabase();
  
  const { count, error } = await supabase
    .from('accounts')
    .select('*', { count: 'exact', head: true });
  
  if (error) {
    console.error('Error getting user count:', error);
    return res.status(500).json({ success: false, message: 'Failed to get user count.' });
  }
  
  return res.status(200).json({ success: true, count: count || 0 });
}

async function handleSendReadyEmail(req, res) {
  const { orderId } = req.body;
  
  if (!orderId) {
    return res.status(400).json({ success: false, message: 'Order ID is required.' });
  }
  
  const supabase = db.getSupabase();
  
  // Get the order
  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();
  
  if (error || !order) {
    console.error('Error fetching order:', error);
    return res.status(404).json({ success: false, message: 'Order not found.' });
  }
  
  // Send email
  const result = await email.sendReadyForPickupEmail(
    order.user_email,
    order.pickup_instructions,
    { country: order.country }
  );
  
  if (!result.success) {
    return res.status(500).json({ success: false, message: 'Failed to send email: ' + result.error });
  }
  
  // Update order status to completed
  await supabase
    .from('orders')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', orderId);
  
  return res.status(200).json({ success: true, message: 'Ready for pickup email sent!' });
}

