/**
 * Supabase Database Helper
 * Handles all database operations
 */

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

// ==================== ACCOUNTS ====================

async function findAccountByEmail(email) {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('email', email.toLowerCase())
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('Error finding account:', error);
    return null;
  }
  
  return data;
}

async function createAccount(email, hashedPassword, verificationToken) {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('accounts')
    .insert({
      email: email.toLowerCase(),
      password: hashedPassword,
      email_verified: false,
      email_verification_token: verificationToken,
      admin_approved: false,
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating account:', error);
    throw error;
  }
  
  return data;
}

async function verifyEmail(token) {
  const supabase = getSupabase();
  
  // Find account by verification token
  const { data: account, error: findError } = await supabase
    .from('accounts')
    .select('*')
    .eq('email_verification_token', token)
    .single();
  
  if (findError || !account) {
    return { success: false, message: 'Invalid verification link.' };
  }
  
  if (account.email_verified) {
    return { success: true, message: 'Email already verified.', email: account.email };
  }
  
  // Mark email as verified
  const { error: updateError } = await supabase
    .from('accounts')
    .update({ 
      email_verified: true,
      email_verification_token: null 
    })
    .eq('id', account.id);
  
  if (updateError) {
    console.error('Error verifying email:', updateError);
    return { success: false, message: 'Failed to verify email.' };
  }
  
  return { success: true, message: 'Email verified successfully!', email: account.email };
}

async function updateAccountPassword(accountId, hashedPassword) {
  const supabase = getSupabase();
  
  const { error } = await supabase
    .from('accounts')
    .update({
      password: hashedPassword,
      reset_token: null,
      token_expiry: null,
    })
    .eq('id', accountId);
  
  if (error) {
    console.error('Error updating password:', error);
    throw error;
  }
}

async function setResetToken(accountId, token, expiry) {
  const supabase = getSupabase();
  
  const { error } = await supabase
    .from('accounts')
    .update({
      reset_token: token,
      token_expiry: expiry,
    })
    .eq('id', accountId);
  
  if (error) {
    console.error('Error setting reset token:', error);
    throw error;
  }
}

async function findAccountByResetToken(token) {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('reset_token', token)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('Error finding account by token:', error);
    return null;
  }
  
  return data;
}

async function approveUser(email) {
  const supabase = getSupabase();
  
  // Set both email_verified and admin_approved to true
  // This allows approving users who registered before email verification was added
  const { data, error } = await supabase
    .from('accounts')
    .update({ 
      admin_approved: true,
      email_verified: true  // Force verify on approval
    })
    .eq('email', email.toLowerCase())
    .select()
    .single();
  
  if (error) {
    console.error('Error approving user:', error);
    return { success: false, message: 'Failed to approve user.' };
  }
  
  return { success: true, account: data };
}

async function rejectUser(email) {
  const supabase = getSupabase();
  
  // Delete the account
  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('email', email.toLowerCase());
  
  if (error) {
    console.error('Error rejecting user:', error);
    return { success: false, message: 'Failed to reject user.' };
  }
  
  return { success: true };
}

async function getPendingUsers() {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('accounts')
    .select('id, email, email_verified, admin_approved, created_at')
    .eq('admin_approved', false)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error getting pending users:', error);
    return [];
  }
  
  return data || [];
}

// ==================== ADMINS ====================

async function isAdmin(email) {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('admins')
    .select('id')
    .eq('email', email.toLowerCase())
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('Error checking admin:', error);
    return false;
  }
  
  return !!data;
}

// ==================== VERIFICATION CODES ====================

async function getAllCodes() {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('verification_codes')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error getting codes:', error);
    return [];
  }
  
  return data.map(code => ({
    id: code.id,
    email: code.used_by_email || '',
    validationCode: code.code,
    dropboxLink: code.dropbox_link || '',
    isUsed: !!code.used_by_email,
    createdAt: code.created_at,
  }));
}

async function findCodeByValidation(code) {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('verification_codes')
    .select('*')
    .eq('code', code.trim())
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('Error finding code:', error);
    return null;
  }
  
  if (!data) return null;
  
  return {
    id: data.id,
    email: data.used_by_email || '',
    validationCode: data.code,
    dropboxLink: data.dropbox_link || '',
    isUsed: !!data.used_by_email,
  };
}

async function addNewCode(validationCode, dropboxLink) {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('verification_codes')
    .insert({
      code: validationCode,
      dropbox_link: dropboxLink,
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error adding code:', error);
    throw error;
  }
  
  return data;
}

async function markCodeUsed(codeId, email) {
  const supabase = getSupabase();
  
  const { error } = await supabase
    .from('verification_codes')
    .update({
      used_by_email: email,
      used_at: new Date().toISOString(),
    })
    .eq('id', codeId);
  
  if (error) {
    console.error('Error marking code used:', error);
    throw error;
  }
}

async function generateUniqueCode() {
  const supabase = getSupabase();
  
  // Get all existing codes
  const { data } = await supabase
    .from('verification_codes')
    .select('code');
  
  const existingCodes = (data || []).map(c => c.code);
  
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (existingCodes.includes(code));
  
  return code;
}

async function clearAllCodes() {
  const supabase = getSupabase();
  
  // Get all codes first (for Dropbox folder deletion)
  const codes = await getAllCodes();
  
  // Delete all codes (id is never null, so this matches all rows)
  const { error } = await supabase
    .from('verification_codes')
    .delete()
    .not('id', 'is', null);
  
  if (error) {
    console.error('Error clearing codes:', error);
    throw error;
  }
  
  return codes;
}

// ==================== LOGIN VERIFICATION CODES ====================

function generateLoginCode() {
  // Generate a 6-digit code
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function setLoginCode(email) {
  const supabase = getSupabase();
  
  const code = generateLoginCode();
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 10); // Code valid for 10 minutes
  
  const { error } = await supabase
    .from('accounts')
    .update({
      login_code: code,
      login_code_expiry: expiry.toISOString(),
    })
    .eq('email', email.toLowerCase());
  
  if (error) {
    console.error('Error setting login code:', error);
    throw error;
  }
  
  return code;
}

async function verifyLoginCode(email, code) {
  const supabase = getSupabase();
  
  const { data: account, error } = await supabase
    .from('accounts')
    .select('login_code, login_code_expiry')
    .eq('email', email.toLowerCase())
    .single();
  
  if (error || !account) {
    return { success: false, message: 'Account not found.' };
  }
  
  if (!account.login_code) {
    return { success: false, message: 'No verification code found. Please try logging in again.' };
  }
  
  // Check if code has expired
  if (new Date() > new Date(account.login_code_expiry)) {
    // Clear the expired code
    await supabase
      .from('accounts')
      .update({ login_code: null, login_code_expiry: null })
      .eq('email', email.toLowerCase());
    return { success: false, message: 'Verification code has expired. Please try logging in again.' };
  }
  
  // Check if code matches
  if (account.login_code !== code) {
    return { success: false, message: 'Invalid verification code.' };
  }
  
  // Clear the code after successful verification
  await supabase
    .from('accounts')
    .update({ login_code: null, login_code_expiry: null })
    .eq('email', email.toLowerCase());
  
  return { success: true };
}

module.exports = {
  getSupabase,
  findAccountByEmail,
  createAccount,
  verifyEmail,
  updateAccountPassword,
  setResetToken,
  findAccountByResetToken,
  isAdmin,
  approveUser,
  rejectUser,
  getPendingUsers,
  getAllCodes,
  findCodeByValidation,
  addNewCode,
  markCodeUsed,
  generateUniqueCode,
  clearAllCodes,
  setLoginCode,
  verifyLoginCode,
};
