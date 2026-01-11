-- Add client_id to conversations table to link conversations to clients
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id);

-- Add avatar_url and email to clients table for storing profile info from conversations
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS avatar_url text,
ADD COLUMN IF NOT EXISTS email text;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversations_client_id ON public.conversations(client_id);

-- Create a function to automatically link or create clients from conversations
CREATE OR REPLACE FUNCTION public.link_conversation_to_client()
RETURNS TRIGGER AS $$
DECLARE
  existing_client_id UUID;
BEGIN
  -- Only process if we have customer info and workspace
  IF NEW.workspace_id IS NOT NULL AND (NEW.customer_phone IS NOT NULL OR NEW.customer_name IS NOT NULL) THEN
    -- Try to find existing client by phone in same workspace
    IF NEW.customer_phone IS NOT NULL AND NEW.customer_phone != '' THEN
      SELECT id INTO existing_client_id
      FROM public.clients
      WHERE workspace_id = NEW.workspace_id
        AND phone = NEW.customer_phone
      LIMIT 1;
    END IF;

    IF existing_client_id IS NOT NULL THEN
      -- Link to existing client and update info
      NEW.client_id := existing_client_id;
      
      -- Update client with latest avatar if available
      UPDATE public.clients
      SET 
        avatar_url = COALESCE(NEW.customer_avatar, avatar_url),
        name = COALESCE(NEW.customer_name, name),
        updated_at = now()
      WHERE id = existing_client_id;
    ELSE
      -- Create new client
      INSERT INTO public.clients (workspace_id, name, phone, avatar_url, email)
      VALUES (NEW.workspace_id, NEW.customer_name, NEW.customer_phone, NEW.customer_avatar, NEW.customer_email)
      RETURNING id INTO NEW.client_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-link conversations to clients
DROP TRIGGER IF EXISTS link_conversation_to_client_trigger ON public.conversations;
CREATE TRIGGER link_conversation_to_client_trigger
BEFORE INSERT ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.link_conversation_to_client();

-- Also update existing conversations to link them to clients
-- This will create clients for existing conversations that don't have one
DO $$
DECLARE
  conv RECORD;
  existing_client_id UUID;
BEGIN
  FOR conv IN 
    SELECT id, workspace_id, customer_name, customer_phone, customer_avatar, customer_email
    FROM public.conversations
    WHERE client_id IS NULL AND workspace_id IS NOT NULL
  LOOP
    existing_client_id := NULL;
    
    -- Try to find existing client by phone
    IF conv.customer_phone IS NOT NULL AND conv.customer_phone != '' THEN
      SELECT id INTO existing_client_id
      FROM public.clients
      WHERE workspace_id = conv.workspace_id
        AND phone = conv.customer_phone
      LIMIT 1;
    END IF;

    IF existing_client_id IS NOT NULL THEN
      -- Link to existing client
      UPDATE public.conversations SET client_id = existing_client_id WHERE id = conv.id;
      
      -- Update client with latest avatar
      UPDATE public.clients
      SET avatar_url = COALESCE(conv.customer_avatar, avatar_url),
          updated_at = now()
      WHERE id = existing_client_id;
    ELSE
      -- Create new client and link
      INSERT INTO public.clients (workspace_id, name, phone, avatar_url, email)
      VALUES (conv.workspace_id, conv.customer_name, conv.customer_phone, conv.customer_avatar, conv.customer_email)
      RETURNING id INTO existing_client_id;
      
      UPDATE public.conversations SET client_id = existing_client_id WHERE id = conv.id;
    END IF;
  END LOOP;
END $$;