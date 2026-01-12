import { useState, useMemo } from "react";
import { Search, User, Phone, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Client {
  id: string;
  name: string;
  phone: string | null;
  avatar_url?: string | null;
}

interface ClientSelectorProps {
  clients: Client[];
  selectedClientId: string;
  onSelectClient: (clientId: string, client?: Client) => void;
}

const ClientSelector = ({ clients, selectedClientId, onSelectClient }: ClientSelectorProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    
    const query = searchQuery.toLowerCase();
    return clients.filter(client => 
      client.name.toLowerCase().includes(query) ||
      (client.phone && client.phone.includes(query))
    );
  }, [clients, searchQuery]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <div className="space-y-3">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="بحث بالاسم أو رقم الهاتف..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pr-10"
        />
      </div>

      {/* Client List */}
      <ScrollArea className="h-48 rounded-lg border bg-background">
        <div className="p-2 space-y-1">
          {/* New Client Option */}
          <button
            type="button"
            onClick={() => onSelectClient("new")}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-right",
              selectedClientId === "new" 
                ? "bg-primary text-primary-foreground" 
                : "hover:bg-muted/50"
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              selectedClientId === "new" 
                ? "bg-primary-foreground/20" 
                : "bg-primary/10"
            )}>
              <UserPlus className={cn(
                "w-5 h-5",
                selectedClientId === "new" 
                  ? "text-primary-foreground" 
                  : "text-primary"
              )} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">عميل جديد</p>
              <p className={cn(
                "text-xs",
                selectedClientId === "new" 
                  ? "text-primary-foreground/70" 
                  : "text-muted-foreground"
              )}>
                إضافة بيانات عميل جديد
              </p>
            </div>
          </button>

          {/* Clients List */}
          {filteredClients.length === 0 && searchQuery && (
            <div className="py-8 text-center text-muted-foreground">
              <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>لا توجد نتائج للبحث</p>
            </div>
          )}

          {filteredClients.map(client => (
            <button
              key={client.id}
              type="button"
              onClick={() => onSelectClient(client.id, client)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-right",
                selectedClientId === client.id 
                  ? "bg-primary text-primary-foreground" 
                  : "hover:bg-muted/50"
              )}
            >
              <Avatar className="w-10 h-10">
                <AvatarImage src={client.avatar_url || undefined} alt={client.name} />
                <AvatarFallback className={cn(
                  selectedClientId === client.id 
                    ? "bg-primary-foreground/20 text-primary-foreground" 
                    : "bg-muted"
                )}>
                  {getInitials(client.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{client.name}</p>
                {client.phone && (
                  <p className={cn(
                    "text-xs flex items-center gap-1",
                    selectedClientId === client.id 
                      ? "text-primary-foreground/70" 
                      : "text-muted-foreground"
                  )}>
                    <Phone className="w-3 h-3" />
                    {client.phone}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>

      {/* Selected Client Indicator */}
      {selectedClientId && selectedClientId !== "new" && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 text-primary text-sm">
          <User className="w-4 h-4" />
          <span>تم اختيار: {clients.find(c => c.id === selectedClientId)?.name}</span>
        </div>
      )}
    </div>
  );
};

export default ClientSelector;
