/**
 * POST /api/order/request-payment
 * Send payment request email to admin
 */

const db = require('../../lib/db');
const auth = require('../../lib/auth');
const { Resend } = require('resend');

const ADMIN_EMAIL = 'studentone.qa@gmail.com';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  
  try {
    const { token, orderId } = req.body;
    
    // Verify token
    const decoded = auth.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ success: false, message: 'Session expired.' });
    }
    
    const userEmail = decoded.email;
    const supabase = db.getSupabase();
    
    // Get the order
    let order;
    if (orderId) {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .eq('user_email', userEmail)
        .single();
      
      if (error || !data) {
        return res.status(404).json({ success: false, message: 'Order not found.' });
      }
      order = data;
    } else {
      // Get most recent pending order
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_email', userEmail)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error || !data) {
        return res.status(404).json({ success: false, message: 'No pending order found.' });
      }
      order = data;
    }
    
    // Generate approval link
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'];
    const baseUrl = `${protocol}://${host}`;
    const approvalLink = `${baseUrl}/api/order/approve?orderId=${order.id}&token=${auth.generateToken({ orderId: order.id, action: 'approve' })}`;
    
    // Send email to admin
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const { error: emailError } = await resend.emails.send({
      from: 'Digital Photo <noreply@parallaxbay.com>',
      to: [ADMIN_EMAIL],
      subject: `Payment Approval Request - ${userEmail}`,
      html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <h1 style="color: #4f46e5; margin: 0 0 24px; font-size: 24px;">Payment Approval Request</h1>
      
      <p><strong>User:</strong> ${userEmail}</p>
      <p><strong>Order ID:</strong> ${order.id}</p>
      <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
      
      ${order.dropbox_link ? `<p><strong>Photos:</strong> <a href="${order.dropbox_link}" style="color: #4f46e5;">View in Dropbox</a></p>` : ''}
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${approvalLink}" 
           style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
                  color: white; padding: 16px 40px; text-decoration: none; 
                  border-radius: 10px; font-weight: 600; font-size: 16px;">
          Approve Payment
        </a>
      </div>
      
      <p style="color: #64748b; font-size: 14px;">
        Clicking "Approve Payment" will generate a verification code and send it to the user.
      </p>
    </div>
  </div>
</body>
</html>
      `,
    });
    
    if (emailError) {
      console.error('Email error:', emailError);
      return res.status(500).json({ success: false, message: 'Failed to send email to admin.' });
    }
    
    // Update order status
    await supabase
      .from('orders')
      .update({
        status: 'paid',
        payment_requested_at: new Date().toISOString(),
      })
      .eq('id', order.id);
    
    return res.status(200).json({
      success: true,
      message: 'Payment request sent to admin!',
    });
    
  } catch (error) {
    console.error('Request payment error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred.' });
  }
};

