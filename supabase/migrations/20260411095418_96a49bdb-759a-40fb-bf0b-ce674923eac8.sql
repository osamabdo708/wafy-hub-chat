UPDATE channel_integrations 
SET 
  account_id = '950989414762380',
  config = jsonb_set(config::jsonb, '{phone_number_id}', '"950989414762380"')
WHERE id = 'ed6af660-bcb4-4221-acb9-0c7dcd31a0a3';