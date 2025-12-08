import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { User } from "lucide-react";
import genieIcon from "@/assets/agent-icon.png";

interface Agent {
  id: string;
  name: string;
  avatar_url: string | null;
  is_ai: boolean;
  is_system: boolean;
}

interface AgentSelectorProps {
  value: string | null;
  onChange: (agentId: string | null) => void;
  disabled?: boolean;
}

export const AgentSelector = ({ value, onChange, disabled }: AgentSelectorProps) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_user_id', user.id)
        .maybeSingle();

      if (!workspace) return;

      const { data: agentsData } = await supabase
        .from('agents')
        .select('id, name, avatar_url, is_ai, is_system')
        .eq('workspace_id', workspace.id)
        .order('is_system', { ascending: false })
        .order('name', { ascending: true });

      setAgents(agentsData || []);
    } catch (error) {
      console.error('Error fetching agents:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Select disabled>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="جاري التحميل..." />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select
      value={value || "unassigned"}
      onValueChange={(val) => onChange(val === "unassigned" ? null : val)}
      disabled={disabled}
    >
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="تعيين وكيل" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unassigned">
          <span className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            غير معين
          </span>
        </SelectItem>
        {agents.map((agent) => (
          <SelectItem key={agent.id} value={agent.id}>
            <span className="flex items-center gap-2">
              {agent.is_ai ? (
                <img src={genieIcon} alt="المارد" className="w-4 h-4" />
              ) : agent.avatar_url ? (
                <img src={agent.avatar_url} alt={agent.name} className="w-4 h-4 rounded-full object-cover" />
              ) : (
                <User className="w-4 h-4" />
              )}
              {agent.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
