/**
 * Email Helper using Resend
 * Clean, simple transactional emails
 */

const { Resend } = require('resend');

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

// From email using your verified domain
const FROM_EMAIL = 'Digital Photo <noreply@parallaxbay.com>';

/**
 * Send photo download email
 */
async function sendPhotoEmail(to, downloadLink, code) {
  const resend = getResend();
  
  const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #4f46e5; margin: 0; font-size: 24px;">Your Photo is Ready!</h1>
      </div>
      
      <p style="margin: 0 0 16px;">Hi there,</p>
      
      <p style="margin: 0 0 24px;">Great news! Your digital photo has been processed and is ready for download.</p>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${downloadLink}" 
           style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); 
                  color: white; padding: 16px 40px; text-decoration: none; 
                  border-radius: 10px; font-weight: 600; font-size: 16px;">
          Download Photo
        </a>
      </div>
      
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
        <strong style="color: #92400e;">Important:</strong>
        <span style="color: #78350f;">Please download your photo within 24 hours.</span>
      </div>
      
      <p style="margin: 24px 0 0; color: #64748b; font-size: 14px;">
        <strong>Your Code:</strong> ${code}
      </p>
      
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
      
      <p style="margin: 0; color: #64748b; font-size: 14px;">
        Questions? Reach out to us on WhatsApp.
      </p>
    </div>
  </div>
</body>
</html>
  `;
  
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: 'Your Digital Photo - Download Link',
      html: htmlBody,
    });
    
    if (error) {
      console.error('Resend error:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true, id: data?.id };
  } catch (error) {
    console.error('Error sending photo email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send password reset email
 */
async function sendResetEmail(to, resetLink) {
  const resend = getResend();
  
  const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #4f46e5; margin: 0; font-size: 24px;">Reset Your Password</h1>
      </div>
      
      <p style="margin: 0 0 16px;">Hi there,</p>
      
      <p style="margin: 0 0 24px;">We received a request to reset your password. Click the button below to create a new password:</p>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetLink}" 
           style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); 
                  color: white; padding: 16px 40px; text-decoration: none; 
                  border-radius: 10px; font-weight: 600; font-size: 16px;">
          Reset Password
        </a>
      </div>
      
      <p style="margin: 24px 0; color: #64748b; font-size: 14px; text-align: center;">
        This link expires in 1 hour.
      </p>
      
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;">
      
      <p style="margin: 0; color: #94a3b8; font-size: 13px;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  </div>
</body>
</html>
  `;
  
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: 'Reset Your Password - Digital Photo',
      html: htmlBody,
    });
    
    if (error) {
      console.error('Resend error:', error);
      return { success: false, error: error.message };
    }
    
    return { success: true, id: data?.id };
  } catch (error) {
    console.error('Error sending reset email:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendPhotoEmail,
  sendResetEmail,
};
