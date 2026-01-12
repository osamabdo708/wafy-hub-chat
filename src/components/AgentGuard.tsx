import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAgentAuth } from "@/contexts/AgentAuthContext";

interface AgentGuardProps {
  children: ReactNode;
}

const AgentGuard = ({ children }: AgentGuardProps) => {
  const { isAuthenticated, isLoading } = useAgentAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">جاري التحميل...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/agent-login" replace />;
  }

  return <>{children}</>;
};

export default AgentGuard;
