
INSERT INTO public.app_settings (key, value, description, category, is_sensitive)
VALUES 
  ('INSTAGRAM_APP_ID', NULL, 'Instagram App ID from Meta Developer Console', 'instagram', false),
  ('INSTAGRAM_APP_SECRET', NULL, 'Instagram App Secret from Meta Developer Console', 'instagram', true),
  ('INSTAGRAM_WEBHOOK_VERIFY_TOKEN', NULL, 'Instagram Webhook Verify Token', 'instagram', true)
ON CONFLICT (key) DO NOTHING;
