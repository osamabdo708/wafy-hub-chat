
-- Create workspace_members table
CREATE TABLE public.workspace_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

-- Enable RLS
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Members can view their own workspace members
CREATE POLICY "Members can view workspace members"
ON public.workspace_members
FOR SELECT
TO authenticated
USING (
  workspace_id IN (
    SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()
  )
);

-- Only workspace owner can insert members
CREATE POLICY "Owner can add members"
ON public.workspace_members
FOR INSERT
TO authenticated
WITH CHECK (
  workspace_id IN (
    SELECT w.id FROM public.workspaces w WHERE w.owner_user_id = auth.uid()
  )
);

-- Only workspace owner can delete members
CREATE POLICY "Owner can remove members"
ON public.workspace_members
FOR DELETE
TO authenticated
USING (
  workspace_id IN (
    SELECT w.id FROM public.workspaces w WHERE w.owner_user_id = auth.uid()
  )
);

-- Auto-add owner as member when workspace is created
CREATE OR REPLACE FUNCTION public.auto_add_owner_as_member()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.owner_user_id, 'owner')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_workspace_created_add_owner
AFTER INSERT ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.auto_add_owner_as_member();

-- Backfill: add existing workspace owners as members
INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT id, owner_user_id, 'owner'
FROM public.workspaces
WHERE owner_user_id IS NOT NULL
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- Enable realtime for workspace_members
ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_members;
