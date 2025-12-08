-- Create function to automatically create workspace for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_workspace_id uuid;
BEGIN
  -- Create a workspace for the new user
  INSERT INTO public.workspaces (name, owner_user_id)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'My Workspace'), NEW.id)
  RETURNING id INTO new_workspace_id;
  
  -- Create default المارد agent for the workspace
  INSERT INTO public.agents (workspace_id, name, is_ai, is_system)
  VALUES (new_workspace_id, 'المارد', true, true);
  
  RETURN NEW;
END;
$$;

-- Create trigger to run after user signup
DROP TRIGGER IF EXISTS on_auth_user_created_workspace ON auth.users;
CREATE TRIGGER on_auth_user_created_workspace
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_workspace();