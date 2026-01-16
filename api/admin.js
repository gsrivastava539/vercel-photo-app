/**
 * POST /api/admin
 * Consolidated admin endpoint - handles create-code, codes, clear-all
 */

const db = require('../lib/db');
const authLib = require('../lib/auth');
const dropbox = require('../lib/dropbox');
const emailService = require('../lib/email');
const { Resend } = require('resend');

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
      case 'all-users':
        return await handleGetAllUsers(req, res);
      case 'send-email':
        return await handleSendEmail(req, res);
      case 'pending-users':
        return await handlePendingUsers(req, res);
      case 'approve-user':
        return await handleApproveUser(req, res);
      case 'reject-user':
        return await handleRejectUser(req, res);
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

async function handleGetAllUsers(req, res) {
  const supabase = db.getSupabase();
  
  const { data: users, error } = await supabase
    .from('accounts')
    .select('email')
    .order('email', { ascending: true });
  
  if (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
  
  return res.status(200).json({ success: true, users: users || [] });
}

async function handleSendEmail(req, res) {
  const { to, subject, body } = req.body;
  
  if (!to || !subject || !body) {
    return res.status(400).json({ success: false, message: 'To, subject, and body are required.' });
  }
  
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const { data, error } = await resend.emails.send({
      from: 'Digital Photo <noreply@parallaxbay.com>',
      to: [to],
      subject: subject,
      html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <div style="white-space: pre-wrap; color: #1e293b; font-size: 16px; line-height: 1.6;">${body}</div>
      
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
    
    if (error) {
      console.error('Resend error:', error);
      return res.status(500).json({ success: false, message: 'Failed to send email: ' + error.message });
    }
    
    return res.status(200).json({ success: true, message: 'Email sent successfully!' });
  } catch (err) {
    console.error('Email send error:', err);
    return res.status(500).json({ success: false, message: 'Failed to send email.' });
  }
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
  const result = await emailService.sendReadyForPickupEmail(
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

async function handlePendingUsers(req, res) {
  const pendingUsers = await db.getPendingUsers();
  return res.status(200).json({ success: true, users: pendingUsers });
}

async function handleApproveUser(req, res) {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required.' });
  }
  
  const result = await db.approveUser(email);
  
  if (!result.success) {
    return res.status(500).json({ success: false, message: result.message });
  }
  
  // Send approval notification email to user
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'];
    
    await resend.emails.send({
      from: 'Digital Photo <noreply@parallaxbay.com>',
      to: [email],
      subject: '✅ Your Account Has Been Approved! - Digital Photo',
      html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <h2 style="color: #059669; margin: 0 0 20px; text-align: center;">✅ Account Approved!</h2>
      <p style="color: #64748b; margin-bottom: 24px; text-align: center;">Great news! Your account has been approved. You can now log in and start using Digital Photo.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${protocol}://${host}/" style="background: #4f46e5; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Log In Now</a>
      </div>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
      <p style="margin: 0; color: #64748b; font-size: 14px; text-align: center;">
        Questions? Reach out on WhatsApp: <a href="https://wa.me/15513587475" style="color: #4f46e5;">551-358-7475</a>
      </p>
    </div>
  </div>
</body>
</html>
      `,
    });
  } catch (emailError) {
    console.error('Failed to send approval email:', emailError);
    // Don't fail the approval if email fails
  }
  
  return res.status(200).json({ success: true, message: `User ${email} approved successfully!` });
}

async function handleRejectUser(req, res) {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required.' });
  }
  
  const result = await db.rejectUser(email);
  
  if (!result.success) {
    return res.status(500).json({ success: false, message: result.message });
  }
  
  // Optionally send rejection email
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    await resend.emails.send({
      from: 'Digital Photo <noreply@parallaxbay.com>',
      to: [email],
      subject: 'Account Registration Update - Digital Photo',
      html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <h2 style="color: #64748b; margin: 0 0 20px; text-align: center;">Account Registration Update</h2>
      <p style="color: #64748b; margin-bottom: 24px;">Thank you for your interest in Digital Photo. Unfortunately, we are unable to approve your account registration at this time.</p>
      <p style="color: #64748b;">If you believe this was a mistake or have questions, please contact us.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
      <p style="margin: 0; color: #64748b; font-size: 14px; text-align: center;">
        Questions? Reach out on WhatsApp: <a href="https://wa.me/15513587475" style="color: #4f46e5;">551-358-7475</a>
      </p>
    </div>
  </div>
</body>
</html>
      `,
    });
  } catch (emailError) {
    console.error('Failed to send rejection email:', emailError);
  }
  
  return res.status(200).json({ success: true, message: `User ${email} rejected and removed.` });
}

