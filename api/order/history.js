/**
 * POST /api/order/history
 * Get order history for user
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
    
    // Get all orders for user
    const supabase = db.getSupabase();
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_email', userEmail)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      console.error('Error fetching orders:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch orders.' });
    }
    
    return res.status(200).json({
      success: true,
      orders: orders || [],
    });
    
  } catch (error) {
    console.error('History error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred.' });
  }
};

