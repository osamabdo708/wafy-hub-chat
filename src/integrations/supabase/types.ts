export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      agents: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          is_ai: boolean | null
          is_system: boolean | null
          name: string
          updated_at: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_ai?: boolean | null
          is_system?: boolean | null
          name: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_ai?: boolean | null
          is_system?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_configs: {
        Row: {
          auth_url: string | null
          color: string | null
          config_schema: Json | null
          created_at: string | null
          display_name: string
          icon_name: string | null
          id: string
          provider: string
          refresh_url: string | null
          scopes: Json | null
          supports_polling: boolean | null
          supports_refresh: boolean | null
          supports_webhook: boolean | null
          token_url: string | null
          webhook_register_url: string | null
        }
        Insert: {
          auth_url?: string | null
          color?: string | null
          config_schema?: Json | null
          created_at?: string | null
          display_name: string
          icon_name?: string | null
          id?: string
          provider: string
          refresh_url?: string | null
          scopes?: Json | null
          supports_polling?: boolean | null
          supports_refresh?: boolean | null
          supports_webhook?: boolean | null
          token_url?: string | null
          webhook_register_url?: string | null
        }
        Update: {
          auth_url?: string | null
          color?: string | null
          config_schema?: Json | null
          created_at?: string | null
          display_name?: string
          icon_name?: string | null
          id?: string
          provider?: string
          refresh_url?: string | null
          scopes?: Json | null
          supports_polling?: boolean | null
          supports_refresh?: boolean | null
          supports_webhook?: boolean | null
          token_url?: string | null
          webhook_register_url?: string | null
        }
        Relationships: []
      }
      channel_connections: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string
          last_synced_at: string | null
          provider: string
          provider_channel_id: string | null
          provider_entity_name: string | null
          scopes: string[] | null
          status: string | null
          updated_at: string | null
          webhook_subscribed: boolean | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          last_synced_at?: string | null
          provider: string
          provider_channel_id?: string | null
          provider_entity_name?: string | null
          scopes?: string[] | null
          status?: string | null
          updated_at?: string | null
          webhook_subscribed?: boolean | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          last_synced_at?: string | null
          provider?: string
          provider_channel_id?: string | null
          provider_entity_name?: string | null
          scopes?: string[] | null
          status?: string | null
          updated_at?: string | null
          webhook_subscribed?: boolean | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_integrations: {
        Row: {
          account_id: string | null
          channel: Database["public"]["Enums"]["channel_type"]
          config: Json | null
          created_at: string | null
          id: string
          is_connected: boolean | null
          last_fetch_timestamp: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          account_id?: string | null
          channel: Database["public"]["Enums"]["channel_type"]
          config?: Json | null
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          last_fetch_timestamp?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          account_id?: string | null
          channel?: Database["public"]["Enums"]["channel_type"]
          config?: Json | null
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          last_fetch_timestamp?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_integrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_enabled: boolean | null
          assigned_agent_id: string | null
          assigned_to: string | null
          channel: Database["public"]["Enums"]["channel_type"]
          created_at: string | null
          customer_avatar: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          last_message_at: string | null
          platform: string | null
          status: Database["public"]["Enums"]["conversation_status"] | null
          tags: string[] | null
          thread_id: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          ai_enabled?: boolean | null
          assigned_agent_id?: string | null
          assigned_to?: string | null
          channel: Database["public"]["Enums"]["channel_type"]
          created_at?: string | null
          customer_avatar?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          last_message_at?: string | null
          platform?: string | null
          status?: Database["public"]["Enums"]["conversation_status"] | null
          tags?: string[] | null
          thread_id?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          ai_enabled?: boolean | null
          assigned_agent_id?: string | null
          assigned_to?: string | null
          channel?: Database["public"]["Enums"]["channel_type"]
          created_at?: string | null
          customer_avatar?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          last_message_at?: string | null
          platform?: string | null
          status?: Database["public"]["Enums"]["conversation_status"] | null
          tags?: string[] | null
          thread_id?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_notes: {
        Row: {
          author_id: string
          content: string
          conversation_id: string
          created_at: string | null
          id: string
        }
        Insert: {
          author_id: string
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
        }
        Update: {
          author_id?: string
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json | null
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          is_old: boolean | null
          is_read: boolean | null
          message_id: string | null
          reply_sent: boolean | null
          sender_id: string | null
          sender_type: string
        }
        Insert: {
          attachments?: Json | null
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          is_old?: boolean | null
          is_read?: boolean | null
          message_id?: string | null
          reply_sent?: boolean | null
          sender_id?: string | null
          sender_type: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          is_old?: boolean | null
          is_read?: boolean | null
          message_id?: string | null
          reply_sent?: boolean | null
          sender_id?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_tokens: {
        Row: {
          access_token_encrypted: string
          connection_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          meta: Json | null
          refresh_token_encrypted: string | null
          token_type: string | null
          updated_at: string | null
        }
        Insert: {
          access_token_encrypted: string
          connection_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          meta?: Json | null
          refresh_token_encrypted?: string | null
          token_type?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token_encrypted?: string
          connection_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          meta?: Json | null
          refresh_token_encrypted?: string | null
          token_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oauth_tokens_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          ai_generated: boolean | null
          assigned_to: string | null
          conversation_id: string | null
          created_at: string | null
          created_by: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          notes: string | null
          order_number: string
          payment_link: string | null
          payment_status: string | null
          price: number
          product_id: string | null
          service_id: string | null
          shipping_address: string | null
          shipping_method_id: string | null
          source_platform: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          assigned_to?: string | null
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          notes?: string | null
          order_number: string
          payment_link?: string | null
          payment_status?: string | null
          price: number
          product_id?: string | null
          service_id?: string | null
          shipping_address?: string | null
          shipping_method_id?: string | null
          source_platform?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          assigned_to?: string | null
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          payment_link?: string | null
          payment_status?: string | null
          price?: number
          product_id?: string | null
          service_id?: string | null
          shipping_address?: string | null
          shipping_method_id?: string | null
          source_platform?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shipping_method_id_fkey"
            columns: ["shipping_method_id"]
            isOneToOne: false
            referencedRelation: "shipping_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settings: {
        Row: {
          cod_enabled: boolean | null
          created_at: string
          id: string
          paytabs_enabled: boolean | null
          paytabs_profile_id: string | null
          paytabs_server_key_encrypted: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          cod_enabled?: boolean | null
          created_at?: string
          id?: string
          paytabs_enabled?: boolean | null
          paytabs_profile_id?: string | null
          paytabs_server_key_encrypted?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          cod_enabled?: boolean | null
          created_at?: string
          id?: string
          paytabs_enabled?: boolean | null
          paytabs_profile_id?: string | null
          paytabs_server_key_encrypted?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          attributes: Json | null
          category: string | null
          category_id: string | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          price: number
          stock: number | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          attributes?: Json | null
          category?: string | null
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          price: number
          stock?: number | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          attributes?: Json | null
          category?: string | null
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          price?: number
          stock?: number | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"] | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      quick_replies: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          title: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          title: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          category: string | null
          conditions: string | null
          created_at: string | null
          description: string | null
          duration: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          price: number
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          category?: string | null
          conditions?: string | null
          created_at?: string | null
          description?: string | null
          duration?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          price: number
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          category?: string | null
          conditions?: string | null
          created_at?: string | null
          description?: string | null
          duration?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          price?: number
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_methods: {
        Row: {
          config: Json | null
          created_at: string
          description: string | null
          estimated_days: number | null
          id: string
          is_active: boolean | null
          name: string
          price: number
          provider: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string
          description?: string | null
          estimated_days?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          price?: number
          provider?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string
          description?: string | null
          estimated_days?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number
          provider?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipping_methods_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          event_id: string | null
          id: string
          processed: boolean | null
          processed_at: string | null
          processing_error: string | null
          provider: string
          provider_channel_id: string | null
          raw_payload: Json
          received_at: string | null
          retry_count: number | null
        }
        Insert: {
          event_id?: string | null
          id?: string
          processed?: boolean | null
          processed_at?: string | null
          processing_error?: string | null
          provider: string
          provider_channel_id?: string | null
          raw_payload: Json
          received_at?: string | null
          retry_count?: number | null
        }
        Update: {
          event_id?: string | null
          id?: string
          processed?: boolean | null
          processed_at?: string | null
          processing_error?: string | null
          provider?: string
          provider_channel_id?: string | null
          raw_payload?: Json
          received_at?: string | null
          retry_count?: number | null
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          created_at: string | null
          id: string
          name: string
          owner_user_id: string | null
          settings: Json | null
          social_links: Json | null
          store_address: string | null
          store_banner_url: string | null
          store_description: string | null
          store_email: string | null
          store_enabled: boolean | null
          store_logo_url: string | null
          store_phone: string | null
          store_slug: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          owner_user_id?: string | null
          settings?: Json | null
          social_links?: Json | null
          store_address?: string | null
          store_banner_url?: string | null
          store_description?: string | null
          store_email?: string | null
          store_enabled?: boolean | null
          store_logo_url?: string | null
          store_phone?: string | null
          store_slug?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          owner_user_id?: string | null
          settings?: Json | null
          social_links?: Json | null
          store_address?: string | null
          store_banner_url?: string | null
          store_description?: string | null
          store_email?: string | null
          store_enabled?: boolean | null
          store_logo_url?: string | null
          store_phone?: string | null
          store_slug?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_order_number: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "super_admin"
      channel_type: "whatsapp" | "facebook" | "instagram" | "telegram" | "email"
      conversation_status: "جديد" | "مفتوح" | "مغلق" | "معلق"
      order_status: "مسودة" | "قيد الانتظار" | "مؤكد" | "مكتمل" | "ملغي"
      user_role: "admin" | "manager" | "agent" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user", "super_admin"],
      channel_type: ["whatsapp", "facebook", "instagram", "telegram", "email"],
      conversation_status: ["جديد", "مفتوح", "مغلق", "معلق"],
      order_status: ["مسودة", "قيد الانتظار", "مؤكد", "مكتمل", "ملغي"],
      user_role: ["admin", "manager", "agent", "viewer"],
    },
  },
} as const
