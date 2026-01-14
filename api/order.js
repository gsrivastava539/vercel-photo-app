/**
 * /api/order
 * Consolidated order endpoint - handles upload, status, history, request-payment
 * GET for approve action (from email link)
 */

const db = require('../lib/db');
const authLib = require('../lib/auth');
const dropbox = require('../lib/dropbox');
const { Resend } = require('resend');
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
  const { fileName, fileData, country, phone, address } = req.body;
  const userEmail = decoded.email;
  const sanitizedEmail = userEmail.replace(/[^a-zA-Z0-9]/g, '_');
  const folderPath = `/UserPhotos/${sanitizedEmail}`;
  
  // Validate required fields
  if (!country) {
    return res.status(400).json({ success: false, message: 'Please select a country.' });
  }
  if (!phone) {
    return res.status(400).json({ success: false, message: 'Please enter your phone number.' });
  }
  
  // Create folder
  await dropbox.createFolder(folderPath);
  
  // Upload file
  const base64Data = fileData.split(',')[1];
  const fileBuffer = Buffer.from(base64Data, 'base64');
  const filePath = `${folderPath}/${Date.now()}_${fileName}`;
  
  const uploadResult = await dropbox.uploadFile(fileBuffer, filePath);
  if (!uploadResult.success) {
    return res.status(500).json({ success: false, message: 'Failed to upload photo.' });
  }
  
  // Get shared link
  let sharedLink = '';
  const linkResult = await dropbox.createSharedLink(folderPath);
  if (linkResult.success) {
    sharedLink = linkResult.url;
  }
  
  // Create order with country, phone, and address
  const supabase = db.getSupabase();
  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      user_email: userEmail,
      status: 'pending',
      dropbox_folder: folderPath,
      dropbox_link: sharedLink,
      country: country,
      phone: phone,
      address: address || null
    })
    .select()
    .single();
  
  if (error) {
    console.error('Order creation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create order.' });
  }
  
  // Cleanup: Keep only last 3 orders per user (free tier optimization)
  await cleanupOldOrders(supabase, userEmail, 3);
  
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
  
  // Update order status to approved
  await supabase.from('orders').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', orderId);
  
  // Send simple approval email to user
  const resend = new Resend(process.env.RESEND_API_KEY);
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['host'];
  
  await resend.emails.send({
    from: 'Digital Photo <noreply@parallaxbay.com>',
    to: [order.user_email],
    subject: 'Payment Approved - Digital Photo',
    html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
        <h1 style="color: #059669; margin: 0; font-size: 24px;">Payment Approved!</h1>
      </div>
      
      <p style="margin: 0 0 16px;">Hi there,</p>
      
      <p style="margin: 0 0 24px;">Great news! Your payment has been approved by the admin. We are now processing your photo order.</p>
      
      <div style="background: #f0fdf4; border-left: 4px solid #059669; padding: 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
        <p style="margin: 0; color: #166534;"><strong>What's Next?</strong></p>
        <p style="margin: 8px 0 0; color: #166534;">Please check back on your dashboard for pickup instructions and updates.</p>
      </div>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${protocol}://${host}/dashboard" 
           style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); 
                  color: white; padding: 16px 40px; text-decoration: none; 
                  border-radius: 10px; font-weight: 600; font-size: 16px;">
          Go to Dashboard
        </a>
      </div>
      
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
      
      <p style="margin: 0; color: #64748b; font-size: 14px; text-align: center;">
        Questions? Reach out on WhatsApp: <a href="https://wa.me/15513587475" style="color: #4f46e5;">551-358-7475</a>
      </p>
    </div>
  </div>
</body>
</html>
    `,
  });
  
  return sendHtml(res, 'Approved!', `Payment approved for <strong>${order.user_email}</strong>.<br><br>User has been notified via email.<br><br>Next: Set pickup instructions in the admin panel.`, true);
}

function sendHtml(res, title, msg, success) {
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`<!DOCTYPE html><html><head><title>${title}</title><style>body{font-family:system-ui;background:#f8fafc;color:#1e293b;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:#ffffff;padding:40px;border-radius:16px;text-align:center;max-width:500px;box-shadow:0 4px 6px rgba(0,0,0,0.1)}h1{color:${success?'#059669':'#dc2626'}}a{color:#4f46e5}</style></head><body><div class="card"><h1>${title}</h1><p>${msg}</p></div></body></html>`);
}

// Keep only the last N orders per user to optimize storage
async function cleanupOldOrders(supabase, userEmail, keepCount) {
  try {
    // Get all orders for this user, ordered by creation date (newest first)
    const { data: orders } = await supabase
      .from('orders')
      .select('id, dropbox_folder')
      .eq('user_email', userEmail)
      .order('created_at', { ascending: false });
    
    if (!orders || orders.length <= keepCount) {
      return; // Nothing to cleanup
    }
    
    // Get orders to delete (all except the newest 'keepCount')
    const ordersToDelete = orders.slice(keepCount);
    const idsToDelete = ordersToDelete.map(o => o.id);
    
    // Delete old orders from database
    if (idsToDelete.length > 0) {
      await supabase
        .from('orders')
        .delete()
        .in('id', idsToDelete);
      
      console.log(`Cleaned up ${idsToDelete.length} old orders for ${userEmail}`);
      
      // Optionally delete old Dropbox folders (commented out to avoid API calls)
      // for (const order of ordersToDelete) {
      //   if (order.dropbox_folder) {
      //     await dropbox.deleteFolder(order.dropbox_folder);
      //   }
      // }
    }
  } catch (err) {
    console.error('Cleanup error (non-fatal):', err);
    // Don't fail the main operation if cleanup fails
  }
}

