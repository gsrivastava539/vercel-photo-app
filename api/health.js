/**
 * GET /api/health
 * Simple health check endpoint
 */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_SERVICE_KEY,
      hasResendKey: !!process.env.RESEND_API_KEY,
      hasDropboxToken: !!process.env.DROPBOX_ACCESS_TOKEN,
      hasJwtSecret: !!process.env.JWT_SECRET,
    }
  });
};

