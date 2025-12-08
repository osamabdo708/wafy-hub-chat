-- Drop the duplicate trigger and function
DROP TRIGGER IF EXISTS on_workspace_created_add_agent ON public.workspaces;
DROP FUNCTION IF EXISTS public.create_default_agent() CASCADE;