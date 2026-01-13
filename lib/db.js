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

async function createAccount(email, hashedPassword) {
  const supabase = getSupabase();
  
  const { data, error } = await supabase
    .from('accounts')
    .insert({
      email: email.toLowerCase(),
      password: hashedPassword,
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating account:', error);
    throw error;
  }
  
  return data;
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

module.exports = {
  getSupabase,
  findAccountByEmail,
  createAccount,
  updateAccountPassword,
  setResetToken,
  findAccountByResetToken,
  isAdmin,
  getAllCodes,
  findCodeByValidation,
  addNewCode,
  markCodeUsed,
  generateUniqueCode,
  clearAllCodes,
};

