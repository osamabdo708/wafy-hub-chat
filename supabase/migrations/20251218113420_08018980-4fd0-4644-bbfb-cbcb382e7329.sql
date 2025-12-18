-- Fix multi-tenant webhook ingestion: allow same provider message_id/thread_id across multiple workspaces

-- 1) Messages: message_id must NOT be globally unique (breaks multi-tenant when same page/account is connected in multiple workspaces)
DROP INDEX IF EXISTS public.idx_messages_message_id;
DROP INDEX IF EXISTS public.unique_message_id;

-- Enforce uniqueness only within a conversation
CREATE UNIQUE INDEX IF NOT EXISTS messages_unique_conversation_message_id
ON public.messages (conversation_id, message_id)
WHERE message_id IS NOT NULL;


-- 2) Conversations: thread_id must NOT be globally unique (breaks multi-tenant for same thread across workspaces)
DROP INDEX IF EXISTS public.idx_conversations_platform_thread;

-- Enforce uniqueness of thread_id only within the same workspace + channel
CREATE UNIQUE INDEX IF NOT EXISTS conversations_unique_workspace_channel_thread
ON public.conversations (workspace_id, channel, thread_id)
WHERE thread_id IS NOT NULL;
