/**
 * POST /api/order/status
 * Get current order status for user
 */

const db = require('../../lib/db');
const auth = require('../../lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  
  try {
    const { token } = req.body;
    
    // Verify token
    const decoded = auth.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ success: false, message: 'Session expired.' });
    }
    
    const userEmail = decoded.email;
    
    // Get most recent active order (not completed)
    const supabase = db.getSupabase();
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_email', userEmail)
      .neq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching order:', error);
    }
    
    return res.status(200).json({
      success: true,
      order: order || null,
    });
    
  } catch (error) {
    console.error('Status error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred.' });
  }
};

