// Public values only (Supabase Dashboard > Project Settings > API). Never put the service_role key here.
export const SUPABASE_URL = 'https://qtmrtxgkisshdtqshjre.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0bXJ0eGdraXNzaGR0cXNoanJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwOTQyMDEsImV4cCI6MjEwNzY3MDIwMX0.CROrmFcFvrVEzKi-qFGagmm3TapDN2PSh6KPtBkEV5A';
// Sign-in buttons shown on the login page. Supported: 'google', 'azure' (Microsoft). Each must also be enabled in Supabase.
export const OAUTH_PROVIDERS = ['azure'];
// GIF picker: get a free key at https://developers.giphy.com (create an app, choose API). Leave '' to hide GIFs.
export const GIPHY_API_KEY = 'tWfClUmrDDnWKNdH1G34GVuIxDYHbaVo';
// CAPTCHA: hCaptcha SITE key (public; hCaptcha dashboard > Sites). The SECRET key goes only in Supabase > Authentication > Attack Protection (provider: hCaptcha). Must be filled in while Supabase's captcha is on, or nobody can log in.
export const HCAPTCHA_SITE_KEY = 'f47c97b4-0e84-4f98-9b6c-6c8884b833d2';
// Voice/video relay (optional but recommended). Calls connect directly between people; some school or phone networks block that.
// A TURN relay fixes those. Paste the ICE servers from a TURN provider, e.g. [{ urls: ['turn:HOST:3478', 'turns:HOST:443?transport=tcp'], username: '...', credential: '...' }]. Leave [] to use STUN only.
export const TURN_SERVERS = [];
