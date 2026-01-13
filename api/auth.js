/**
 * POST /api/auth
 * Consolidated auth endpoint - handles signup, login, forgot, reset, verify
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
      case 'forgot':
        return await handleForgot(req, res);
      case 'reset':
        return await handleReset(req, res);
      case 'verify':
        return await handleVerify(req, res);
      default:
        return res.status(400).json({ success: false, message: 'Invalid action' });
    }
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred.' });
  }
};

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
  
  const hashedPassword = await authLib.hashPassword(password);
  await db.createAccount(fullEmail, hashedPassword);
  
  const isAdmin = await db.isAdmin(fullEmail);
  
  return res.status(200).json({
    success: true,
    message: 'Account created successfully! You can now log in.',
    email: fullEmail,
    isAdmin: isAdmin,
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
    html: `<p>Click <a href="${resetLink}">here</a> to reset your password. This link expires in 1 hour.</p>`,
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

