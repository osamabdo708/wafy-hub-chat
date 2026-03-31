UPDATE channel_configs 
SET 
  auth_url = 'https://www.instagram.com/oauth/authorize/',
  token_url = 'https://api.instagram.com/oauth/access_token',
  refresh_url = 'https://graph.instagram.com/access_token',
  scopes = '{"default": ["instagram_basic", "instagram_manage_messages"]}'::jsonb
WHERE provider = 'instagram';