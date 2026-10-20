// Public Supabase coordinates for the desktop relay.
// Both values are PUBLIC by design (the same ones the web app ships): the
// publishable key only lets a client talk to the API; every row is still
// gated by the signed-in user's RLS. No service-role or admin key ever lives
// in the app or the installer.

module.exports = {
  SUPABASE_URL: 'https://vqyhxjjirskadwomfjkp.supabase.co',
  PUBLISHABLE_KEY: 'sb_publishable_94dmCmHUZLZJFnIaSL_ZJg_VDN-PXOF',
};
