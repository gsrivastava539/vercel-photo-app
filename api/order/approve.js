/**
 * GET /api/order/approve
 * Admin approves payment - generates code and sends to user
 */

const db = require('../../lib/db');
const auth = require('../../lib/auth');
const { Resend } = require('resend');

module.exports = async (req, res) => {
  // This is a GET request from email link
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  
  try {
    const { orderId, token } = req.query;
    
    if (!orderId || !token) {
      return sendHtmlResponse(res, 'Error', 'Invalid approval link.', false);
    }
    
    // Verify token
    const decoded = auth.verifyToken(token);
    if (!decoded || decoded.orderId !== orderId || decoded.action !== 'approve') {
      return sendHtmlResponse(res, 'Error', 'Invalid or expired approval link.', false);
    }
    
    const supabase = db.getSupabase();
    
    // Get the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    
    if (orderError || !order) {
      return sendHtmlResponse(res, 'Error', 'Order not found.', false);
    }
    
    if (order.status === 'approved' || order.status === 'completed') {
      return sendHtmlResponse(res, 'Already Approved', 'This order has already been approved.', true);
    }
    
    // Generate unique 6-digit verification code
    const { data: existingCodes } = await supabase
      .from('verification_codes')
      .select('code');
    
    const usedCodes = (existingCodes || []).map(c => c.code);
    let verificationCode;
    do {
      verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    } while (usedCodes.includes(verificationCode));
    
    // Create Dropbox folder for processed photos
    const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
    const processedFolderPath = `/PhotoRequests/${verificationCode}`;
    
    try {
      await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: processedFolderPath, autorename: false }),
      });
    } catch (e) {
      console.error('Error creating Dropbox folder:', e);
    }
    
    // Create shared link for processed folder
    let sharedLink = '';
    try {
      const linkRes = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: processedFolderPath,
          settings: { requested_visibility: 'public' },
        }),
      });
      
      if (linkRes.ok) {
        const linkData = await linkRes.json();
        sharedLink = linkData.url;
      }
    } catch (e) {
      console.error('Error creating shared link:', e);
    }
    
    // Add verification code to verification_codes table
    await supabase
      .from('verification_codes')
      .insert({
        code: verificationCode,
        dropbox_link: sharedLink,
        used_by_email: null,
      });
    
    // Update order status
    await supabase
      .from('orders')
      .update({
        status: 'approved',
        verification_code: verificationCode,
        approved_at: new Date().toISOString(),
      })
      .eq('id', orderId);
    
    // Send verification code to user
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    await resend.emails.send({
      from: 'Digital Photo <noreply@parallaxbay.com>',
      to: [order.user_email],
      subject: 'Your Verification Code - Digital Photo',
      html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <h1 style="color: #4f46e5; margin: 0 0 24px; font-size: 24px; text-align: center;">Your Payment is Approved!</h1>
      
      <p style="text-align: center;">Your verification code is:</p>
      
      <div style="text-align: center; margin: 24px 0;">
        <span style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); 
                     color: white; padding: 20px 40px; font-size: 32px; font-weight: 700; 
                     letter-spacing: 8px; border-radius: 12px;">
          ${verificationCode}
        </span>
      </div>
      
      <p style="text-align: center; color: #64748b;">
        Use this code on your dashboard to request your digital photo.
      </p>
      
      <div style="text-align: center; margin-top: 32px;">
        <a href="${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['host']}/dashboard" 
           style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); 
                  color: white; padding: 14px 32px; text-decoration: none; 
                  border-radius: 8px; font-weight: 600;">
          Go to Dashboard
        </a>
      </div>
    </div>
  </div>
</body>
</html>
      `,
    });
    
    return sendHtmlResponse(res, 'Approved!', `
      Order approved successfully!<br><br>
      <strong>Verification Code:</strong> ${verificationCode}<br><br>
      The code has been sent to: ${order.user_email}<br><br>
      <strong>Processed Photos Folder:</strong><br>
      <a href="${sharedLink}" target="_blank">${processedFolderPath}</a><br><br>
      Upload the processed photos to this folder.
    `, true);
    
  } catch (error) {
    console.error('Approve error:', error);
    return sendHtmlResponse(res, 'Error', 'An error occurred while processing approval.', false);
  }
};

function sendHtmlResponse(res, title, message, success) {
  const color = success ? '#10b981' : '#ef4444';
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Digital Photo</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f23;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      margin: 0;
    }
    .card {
      background: #1a1a2e;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 40px;
      max-width: 500px;
      text-align: center;
      color: #e2e8f0;
    }
    h1 { color: ${color}; margin-bottom: 20px; }
    a { color: #4f46e5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>
  `);
}

