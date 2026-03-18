
-- Clear expired Meta CDN avatar URLs from conversations and clients so they get refreshed
UPDATE public.conversations 
SET customer_avatar = NULL 
WHERE customer_avatar IS NOT NULL 
  AND (customer_avatar LIKE '%fbcdn.net%' OR customer_avatar LIKE '%facebook.com/app_scoped%' OR customer_avatar LIKE '%cdninstagram.com%');

UPDATE public.clients 
SET avatar_url = NULL 
WHERE avatar_url IS NOT NULL 
  AND (avatar_url LIKE '%fbcdn.net%' OR avatar_url LIKE '%facebook.com/app_scoped%' OR avatar_url LIKE '%cdninstagram.com%');
