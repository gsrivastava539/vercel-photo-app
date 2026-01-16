/**
 * POST /api/auth
 * Consolidated auth endpoint - handles signup, login, forgot, reset, verify, verify-email
 */

const db = require('../lib/db');
const authLib = require('../lib/auth');
const { Resend } = require('resend');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  
  const { action } = req.body;
  
  try {
    switch (action) {
      case 'signup':
        return await handleSignup(req, res);
      case 'login':
        return await handleLogin(req, res);
      case 'verify-login-code':
        return await handleVerifyLoginCode(req, res);
      case 'forgot':
        return await handleForgot(req, res);
      case 'reset':
        return await handleReset(req, res);
      case 'verify':
        return await handleVerify(req, res);
      case 'verify-email':
        return await handleVerifyEmail(req, res);
      default:
        return res.status(400).json({ success: false, message: 'Invalid action' });
    }
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred.' });
  }
};

const ADMIN_EMAIL = 'studentone.qa@gmail.com';

async function handleSignup(req, res) {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }
  
  const fullEmail = email.toLowerCase().trim();
  
  if (!authLib.validateEmail(fullEmail)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
  }
  
  const passwordValidation = authLib.validatePassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ success: false, message: passwordValidation.message });
  }
  
  const existingAccount = await db.findAccountByEmail(fullEmail);
  if (existingAccount) {
    return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
  }
  
  // Generate verification token
  const verificationToken = authLib.generateResetToken();
  
  const hashedPassword = await authLib.hashPassword(password);
  await db.createAccount(fullEmail, hashedPassword, verificationToken);
  
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['host'];
  const verificationLink = `${protocol}://${host}/?verify=${verificationToken}`;
  
  // Send verification email to user
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Digital Photo <noreply@parallaxbay.com>',
      to: [fullEmail],
      subject: '✉️ Verify Your Email - Digital Photo',
      html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <h2 style="color: #4f46e5; margin: 0 0 20px; text-align: center;">✉️ Verify Your Email</h2>
      <p style="color: #64748b; margin-bottom: 24px;">Hi! Please click the button below to verify your email address.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${verificationLink}" style="background: #4f46e5; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Verify Email</a>
      </div>
      <p style="color: #94a3b8; font-size: 14px; margin-top: 24px;">After verification, an admin will review and approve your account. You'll receive another email once approved.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">If you didn't create this account, you can ignore this email.</p>
    </div>
  </div>
</body>
</html>
      `,
    });
  } catch (emailError) {
    console.error('Failed to send verification email:', emailError);
  }
  
  // Send notification email to admin about new user (needs approval)
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Digital Photo <noreply@parallaxbay.com>',
      to: [ADMIN_EMAIL],
      subject: '🆕 New User Needs Approval - Digital Photo',
      html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <h2 style="color: #f59e0b; margin: 0 0 20px; text-align: center;">🆕 New User Needs Approval</h2>
      <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #f59e0b;">
        <p style="margin: 0; font-size: 14px; color: #92400e;">Email Address:</p>
        <p style="margin: 4px 0 0; font-size: 18px; font-weight: 600; color: #78350f;">${fullEmail}</p>
      </div>
      <p style="margin: 0 0 20px; color: #64748b; font-size: 14px; text-align: center;">
        Registered at: ${new Date().toLocaleString()}
      </p>
      <div style="text-align: center;">
        <a href="${protocol}://${host}/admin" style="background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Go to Admin Panel</a>
      </div>
      <p style="margin: 16px 0 0; color: #94a3b8; font-size: 12px; text-align: center;">Review and approve this user in the Pending Users tab.</p>
    </div>
  </div>
</body>
</html>
      `,
    });
  } catch (emailError) {
    console.error('Failed to send admin notification:', emailError);
  }
  
  return res.status(200).json({
    success: true,
    message: 'Account created! Please check your email to verify your account.',
    email: fullEmail,
  });
}

async function handleLogin(req, res) {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }
  
  const fullEmail = email.toLowerCase().trim();
  
  const account = await db.findAccountByEmail(fullEmail);
  if (!account) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }
  
  const isValidPassword = await authLib.comparePassword(password, account.password);
  if (!isValidPassword) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }
  
  // Check if user is admin (admins bypass verification/approval)
  const isAdmin = await db.isAdmin(fullEmail);
  
  // For non-admins, check email verification and admin approval
  if (!isAdmin) {
    if (!account.email_verified) {
      return res.status(403).json({ 
        success: false, 
        message: 'Please verify your email first. Check your inbox for the verification link.',
        needsVerification: true
      });
    }
    
    if (!account.admin_approved) {
      return res.status(403).json({ 
        success: false, 
        message: 'Your account is pending admin approval. You will receive an email once approved.',
        pendingApproval: true
      });
    }
  }
  
  // Generate and send login verification code
  const loginCode = await db.setLoginCode(fullEmail);
  
  // Send verification code email
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Digital Photo <noreply@parallaxbay.com>',
      to: [fullEmail],
      subject: `🔐 Your Login Code: ${loginCode}`,
      html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <h2 style="color: #4f46e5; margin: 0 0 20px; text-align: center;">🔐 Login Verification</h2>
      <p style="color: #64748b; margin-bottom: 24px; text-align: center;">Enter this code to complete your sign in:</p>
      <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
        <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: white; font-family: 'Courier New', monospace;">${loginCode}</span>
      </div>
      <p style="color: #94a3b8; font-size: 14px; margin-top: 24px; text-align: center;">This code will expire in 10 minutes.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0; text-align: center;">If you didn't attempt to log in, please ignore this email and consider changing your password.</p>
    </div>
  </div>
</body>
</html>
      `,
    });
  } catch (emailError) {
    console.error('Failed to send login code email:', emailError);
    return res.status(500).json({ success: false, message: 'Failed to send verification code. Please try again.' });
  }
  
  return res.status(200).json({
    success: true,
    message: 'Verification code sent to your email.',
    email: fullEmail,
    requiresCode: true,
    isAdmin: isAdmin,
  });
}

async function handleVerifyLoginCode(req, res) {
  const { email, code } = req.body;
  
  if (!email || !code) {
    return res.status(400).json({ success: false, message: 'Email and verification code are required.' });
  }
  
  const fullEmail = email.toLowerCase().trim();
  
  // Verify the login code
  const result = await db.verifyLoginCode(fullEmail, code);
  
  if (!result.success) {
    return res.status(401).json({ success: false, message: result.message });
  }
  
  // Code verified! Generate and return the token
  const isAdmin = await db.isAdmin(fullEmail);
  const token = authLib.generateToken({ email: fullEmail, isAdmin: isAdmin });
  
  return res.status(200).json({
    success: true,
    message: 'Login successful!',
    email: fullEmail,
    token: token,
    isAdmin: isAdmin,
  });
}

async function handleForgot(req, res) {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required.' });
  }
  
  const fullEmail = email.toLowerCase().trim();
  const successMessage = 'If an account exists, a reset link has been sent.';
  
  const account = await db.findAccountByEmail(fullEmail);
  if (!account) {
    return res.status(200).json({ success: true, message: successMessage });
  }
  
  const resetToken = authLib.generateResetToken();
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + 1);
  
  await db.setResetToken(account.id, resetToken, expiry.toISOString());
  
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['host'];
  const resetLink = `${protocol}://${host}/reset?token=${resetToken}`;
  
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'Digital Photo <noreply@parallaxbay.com>',
    to: [fullEmail],
    subject: 'Reset Your Password - Digital Photo',
    html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
      <h2 style="color: #4f46e5; margin: 0 0 20px; text-align: center;">🔐 Reset Your Password</h2>
      <p style="color: #64748b; margin-bottom: 24px;">Click the button below to reset your password. This link expires in 1 hour.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetLink}" style="background: #4f46e5; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Reset Password</a>
      </div>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">If you didn't request this, you can ignore this email.</p>
    </div>
  </div>
</body>
</html>
    `,
  });
  
  return res.status(200).json({ success: true, message: successMessage });
}

async function handleReset(req, res) {
  const { token, password } = req.body;
  
  if (!token || !password) {
    return res.status(400).json({ success: false, message: 'Token and password are required.' });
  }
  
  const passwordValidation = authLib.validatePassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ success: false, message: passwordValidation.message });
  }
  
  const account = await db.findAccountByResetToken(token);
  if (!account) {
    return res.status(400).json({ success: false, message: 'Invalid reset link.' });
  }
  
  if (new Date() > new Date(account.token_expiry)) {
    return res.status(400).json({ success: false, message: 'Reset link has expired.' });
  }
  
  const hashedPassword = await authLib.hashPassword(password);
  await db.updateAccountPassword(account.id, hashedPassword);
  
  return res.status(200).json({ success: true, message: 'Password reset successfully!' });
}

async function handleVerify(req, res) {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ valid: false, message: 'Token is required.' });
  }
  
  const decoded = authLib.verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ valid: false, message: 'Invalid or expired token.' });
  }
  
  const isAdmin = await db.isAdmin(decoded.email);
  
  return res.status(200).json({ valid: true, email: decoded.email, isAdmin: isAdmin });
}

async function handleVerifyEmail(req, res) {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ success: false, message: 'Verification token is required.' });
  }
  
  const result = await db.verifyEmail(token);
  
  if (!result.success) {
    return res.status(400).json({ success: false, message: result.message });
  }
  
  return res.status(200).json({ 
    success: true, 
    message: 'Email verified successfully! Your account is now pending admin approval. You will receive an email once approved.',
    email: result.email
  });
}
