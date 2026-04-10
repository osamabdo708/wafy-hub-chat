
-- Delete messages for Instagram conversations
DELETE FROM messages WHERE conversation_id IN (
  SELECT id FROM conversations WHERE channel = 'instagram'
);

-- Delete Instagram conversations
DELETE FROM conversations WHERE channel = 'instagram';

-- Delete Instagram channel integrations
DELETE FROM channel_integrations WHERE channel = 'instagram';

-- Delete Instagram channel connections
DELETE FROM channel_connections WHERE provider = 'instagram';
