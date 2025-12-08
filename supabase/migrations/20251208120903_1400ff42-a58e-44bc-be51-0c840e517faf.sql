-- Update the trigger to NOT create workspace automatically
-- Workspace will be created during onboarding by the user
CREATE OR REPLACE FUNCTION public.handle_new_user_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only create profile, NOT workspace
  -- Workspace creation moved to onboarding flow
  RETURN NEW;
END;
$$;