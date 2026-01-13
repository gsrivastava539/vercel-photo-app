/**
 * /api/order
 * Consolidated order endpoint - handles upload, status, history, request-payment
 * GET for approve action (from email link)
 */

const db = require('../lib/db');
const authLib = require('../lib/auth');
const { Resend } = require('resend');

const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
const ADMIN_EMAIL = 'studentone.qa@gmail.com';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Handle GET request for approve action (from email link)
  if (req.method === 'GET') {
    return await handleApprove(req, res);
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  
  const { action, token } = req.body;
  
  // Verify token for POST requests
  const decoded = authLib.verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, message: 'Session expired.' });
  }
  
  try {
    switch (action) {
      case 'upload':
        return await handleUpload(req, res, decoded);
      case 'status':
        return await handleStatus(req, res, decoded);
      case 'history':
        return await handleHistory(req, res, decoded);
      case 'request-payment':
        return await handleRequestPayment(req, res, decoded);
      default:
        return res.status(400).json({ success: false, message: 'Invalid action' });
    }
  } catch (error) {
    console.error('Order error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred.' });
  }
};

async function handleUpload(req, res, decoded) {
  const { fileName, fileData, country, address } = req.body;
  const userEmail = decoded.email;
  const sanitizedEmail = userEmail.replace(/[^a-zA-Z0-9]/g, '_');
  const folderPath = `/UserPhotos/${sanitizedEmail}`;
  
  // Validate country
  if (!country) {
    return res.status(400).json({ success: false, message: 'Please select a country.' });
  }
  
  // Create folder
  try {
    await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath, autorename: false }),
    });
  } catch (e) {}
  
  // Upload file
  const base64Data = fileData.split(',')[1];
  const fileBuffer = Buffer.from(base64Data, 'base64');
  const filePath = `${folderPath}/${Date.now()}_${fileName}`;
  
  const uploadRes = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ path: filePath, mode: 'add', autorename: true }),
    },
    body: fileBuffer,
  });
  
  if (!uploadRes.ok) {
    return res.status(500).json({ success: false, message: 'Failed to upload photo.' });
  }
  
  // Get shared link
  let sharedLink = '';
  try {
    const linkRes = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath, settings: { requested_visibility: 'public' } }),
    });
    if (linkRes.ok) {
      const linkData = await linkRes.json();
      sharedLink = linkData.url;
    } else {
      const existingRes = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath, direct_only: true }),
      });
      if (existingRes.ok) {
        const existingData = await existingRes.json();
        if (existingData.links?.length > 0) sharedLink = existingData.links[0].url;
      }
    }
  } catch (e) {}
  
  // Create order with country and address
  const supabase = db.getSupabase();
  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      user_email: userEmail,
      status: 'pending',
      dropbox_folder: folderPath,
      dropbox_link: sharedLink,
      country: country,
      address: address || null
    })
    .select()
    .single();
  
  if (error) {
    console.error('Order creation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create order.' });
  }
  
  return res.status(200).json({ success: true, message: 'Photo uploaded!', order: order });
}

async function handleStatus(req, res, decoded) {
  const supabase = db.getSupabase();
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('user_email', decoded.email)
    .neq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  return res.status(200).json({ success: true, order: order || null });
}

async function handleHistory(req, res, decoded) {
  const supabase = db.getSupabase();
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('user_email', decoded.email)
    .order('created_at', { ascending: false })
    .limit(10);
  
  return res.status(200).json({ success: true, orders: orders || [] });
}

async function handleRequestPayment(req, res, decoded) {
  const { orderId } = req.body;
  const supabase = db.getSupabase();
  
  let query = supabase.from('orders').select('*').eq('user_email', decoded.email);
  if (orderId) {
    query = query.eq('id', orderId);
  } else {
    query = query.eq('status', 'pending').order('created_at', { ascending: false }).limit(1);
  }
  
  const { data: order, error } = await query.single();
  if (error || !order) {
    return res.status(404).json({ success: false, message: 'Order not found.' });
  }
  
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['host'];
  const approvalToken = authLib.generateToken({ orderId: order.id, action: 'approve' });
  const approvalLink = `${protocol}://${host}/api/order?approve=true&orderId=${order.id}&token=${approvalToken}`;
  
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'Digital Photo <noreply@parallaxbay.com>',
    to: [ADMIN_EMAIL],
    subject: `Payment Approval - ${decoded.email}`,
    html: `
      <h2>Payment Approval Request</h2>
      <p><strong>User:</strong> ${decoded.email}</p>
      <p><strong>Order:</strong> ${order.id}</p>
      ${order.dropbox_link ? `<p><a href="${order.dropbox_link}">View Photos</a></p>` : ''}
      <p><a href="${approvalLink}" style="background:#10b981;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">Approve Payment</a></p>
    `,
  });
  
  await supabase.from('orders').update({ status: 'paid', payment_requested_at: new Date().toISOString() }).eq('id', order.id);
  
  return res.status(200).json({ success: true, message: 'Payment request sent!' });
}

async function handleApprove(req, res) {
  const { approve, orderId, token } = req.query;
  
  if (!approve || !orderId || !token) {
    return sendHtml(res, 'Error', 'Invalid link.', false);
  }
  
  const decoded = authLib.verifyToken(token);
  if (!decoded || decoded.orderId !== orderId || decoded.action !== 'approve') {
    return sendHtml(res, 'Error', 'Invalid or expired link.', false);
  }
  
  const supabase = db.getSupabase();
  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
  
  if (!order) return sendHtml(res, 'Error', 'Order not found.', false);
  if (order.status === 'approved' || order.status === 'completed') {
    return sendHtml(res, 'Already Approved', 'This order was already approved.', true);
  }
  
  // Generate code
  const { data: existingCodes } = await supabase.from('verification_codes').select('code');
  const usedCodes = (existingCodes || []).map(c => c.code);
  let code;
  do { code = Math.floor(100000 + Math.random() * 900000).toString(); } while (usedCodes.includes(code));
  
  // Create Dropbox folder
  const folderPath = `/PhotoRequests/${code}`;
  try {
    await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath }),
    });
  } catch (e) {}
  
  // Get shared link
  let sharedLink = '';
  try {
    const linkRes = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath, settings: { requested_visibility: 'public' } }),
    });
    if (linkRes.ok) sharedLink = (await linkRes.json()).url;
  } catch (e) {}
  
  // Save code
  await supabase.from('verification_codes').insert({ code, dropbox_link: sharedLink });
  await supabase.from('orders').update({ status: 'approved', verification_code: code, approved_at: new Date().toISOString() }).eq('id', orderId);
  
  // Email user
  const resend = new Resend(process.env.RESEND_API_KEY);
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['host'];
  
  await resend.emails.send({
    from: 'Digital Photo <noreply@parallaxbay.com>',
    to: [order.user_email],
    subject: 'Your Verification Code',
    html: `
      <h2>Payment Approved!</h2>
      <p>Your verification code is: <strong style="font-size:24px;letter-spacing:4px;">${code}</strong></p>
      <p><a href="${protocol}://${host}/dashboard">Go to Dashboard</a></p>
    `,
  });
  
  return sendHtml(res, 'Approved!', `Code <strong>${code}</strong> sent to ${order.user_email}.<br><br>Upload processed photos to: <a href="${sharedLink}">${folderPath}</a>`, true);
}

function sendHtml(res, title, msg, success) {
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`<!DOCTYPE html><html><head><title>${title}</title><style>body{font-family:system-ui;background:#f8fafc;color:#1e293b;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:#ffffff;padding:40px;border-radius:16px;text-align:center;max-width:500px;box-shadow:0 4px 6px rgba(0,0,0,0.1)}h1{color:${success?'#059669':'#dc2626'}}a{color:#4f46e5}</style></head><body><div class="card"><h1>${title}</h1><p>${msg}</p></div></body></html>`);
}

