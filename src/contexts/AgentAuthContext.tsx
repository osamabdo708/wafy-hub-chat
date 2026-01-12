import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AgentSession {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  workspace_id: string;
  workspace_name?: string;
}

interface AgentAuthContextType {
  agent: AgentSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AgentAuthContext = createContext<AgentAuthContextType | undefined>(undefined);

const AGENT_SESSION_KEY = 'agent_session_token';
const AGENT_DATA_KEY = 'agent_data';

export function AgentAuthProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<AgentSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      const sessionToken = localStorage.getItem(AGENT_SESSION_KEY);
      const storedAgent = localStorage.getItem(AGENT_DATA_KEY);
      
      if (sessionToken && storedAgent) {
        try {
          // Verify the session is still valid
          const { data, error } = await supabase.functions.invoke('verify-agent-session', {
            body: { session_token: sessionToken },
          });

          if (error || !data?.valid) {
            // Clear invalid session
            localStorage.removeItem(AGENT_SESSION_KEY);
            localStorage.removeItem(AGENT_DATA_KEY);
            setAgent(null);
          } else {
            setAgent(data.agent);
          }
        } catch (err) {
          console.error('Error verifying agent session:', err);
          localStorage.removeItem(AGENT_SESSION_KEY);
          localStorage.removeItem(AGENT_DATA_KEY);
          setAgent(null);
        }
      }
      
      setIsLoading(false);
    };

    checkSession();
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('agent-login', {
        body: { email, password },
      });

      if (error) {
        console.error('Agent login error:', error);
        return { success: false, error: 'فشل في تسجيل الدخول' };
      }

      if (data.error) {
        return { success: false, error: data.error };
      }

      if (data.success && data.session_token) {
        // Store session
        localStorage.setItem(AGENT_SESSION_KEY, data.session_token);
        localStorage.setItem(AGENT_DATA_KEY, JSON.stringify(data.agent));
        setAgent(data.agent);
        return { success: true };
      }

      return { success: false, error: 'فشل في تسجيل الدخول' };
    } catch (err) {
      console.error('Agent login error:', err);
      return { success: false, error: 'حدث خطأ غير متوقع' };
    }
  };

  const logout = async () => {
    const sessionToken = localStorage.getItem(AGENT_SESSION_KEY);
    
    if (sessionToken) {
      try {
        await supabase.functions.invoke('agent-logout', {
          body: { session_token: sessionToken },
        });
      } catch (err) {
        console.error('Agent logout error:', err);
      }
    }

    localStorage.removeItem(AGENT_SESSION_KEY);
    localStorage.removeItem(AGENT_DATA_KEY);
    setAgent(null);
  };

  return (
    <AgentAuthContext.Provider value={{
      agent,
      isLoading,
      isAuthenticated: !!agent,
      login,
      logout,
    }}>
      {children}
    </AgentAuthContext.Provider>
  );
}

export function useAgentAuth() {
  const context = useContext(AgentAuthContext);
  if (context === undefined) {
    throw new Error('useAgentAuth must be used within an AgentAuthProvider');
  }
  return context;
}
