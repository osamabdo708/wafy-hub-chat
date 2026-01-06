import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Phone, ShoppingCart, Crown, UserPlus, UserCheck, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Client {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
  order_count: number;
}

type ClientClassification = "جديد" | "عادي" | "متكرر" | "VIP";

interface ClassificationStyle {
  label: ClientClassification;
  bgColor: string;
  textColor: string;
  borderColor: string;
  icon: typeof Crown;
}

const getClientClassification = (orderCount: number): ClassificationStyle => {
  if (orderCount >= 10) return { 
    label: "VIP", 
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-700 dark:text-amber-400",
    borderColor: "border-amber-300 dark:border-amber-700",
    icon: Crown
  };
  if (orderCount >= 5) return { 
    label: "متكرر", 
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-700 dark:text-emerald-400",
    borderColor: "border-emerald-300 dark:border-emerald-700",
    icon: Star
  };
  if (orderCount >= 2) return { 
    label: "عادي", 
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    textColor: "text-blue-700 dark:text-blue-400",
    borderColor: "border-blue-300 dark:border-blue-700",
    icon: UserCheck
  };
  return { 
    label: "جديد", 
    bgColor: "bg-slate-100 dark:bg-slate-800/50",
    textColor: "text-slate-600 dark:text-slate-400",
    borderColor: "border-slate-300 dark:border-slate-600",
    icon: UserPlus
  };
};

const Clients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    const fetchWorkspaceAndClients = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspace } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_user_id", user.id)
        .limit(1)
        .single();

      if (!workspace) return;
      setWorkspaceId(workspace.id);

      // Fetch clients with order count
      const { data: clientsData } = await supabase
        .from("clients")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false });

      if (clientsData) {
        // Get order counts for each client
        const clientsWithCounts = await Promise.all(
          clientsData.map(async (client) => {
            const { count } = await supabase
              .from("orders")
              .select("*", { count: "exact", head: true })
              .eq("client_id", client.id);

            return {
              ...client,
              order_count: count || 0,
            };
          })
        );

        setClients(clientsWithCounts);
      }

      setLoading(false);
    };

    fetchWorkspaceAndClients();
  }, []);

  const totalClients = clients.length;
  const vipClients = clients.filter(c => c.order_count >= 10).length;
  const repeatingClients = clients.filter(c => c.order_count >= 5 && c.order_count < 10).length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">العملاء</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">إجمالي العملاء</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-16" /> : totalClients}</div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">عملاء VIP</CardTitle>
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700">
              <Crown className="h-3 w-3" />
              <span className="text-xs font-medium">VIP</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{loading ? <Skeleton className="h-8 w-16" /> : vipClients}</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">عملاء متكررين</CardTitle>
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700">
              <Star className="h-3 w-3" />
              <span className="text-xs font-medium">متكرر</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{loading ? <Skeleton className="h-8 w-16" /> : repeatingClients}</div>
          </CardContent>
        </Card>
      </div>

      {/* Clients Table */}
      <Card>
        <CardHeader>
          <CardTitle>قائمة العملاء</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>لا يوجد عملاء بعد</p>
              <p className="text-sm">سيتم إنشاء العملاء تلقائياً عند استلام الطلبات</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-right font-semibold">الاسم</TableHead>
                  <TableHead className="text-right font-semibold">الهاتف</TableHead>
                  <TableHead className="text-right font-semibold">عدد الطلبات</TableHead>
                  <TableHead className="text-right font-semibold">التصنيف</TableHead>
                  <TableHead className="text-right font-semibold">تاريخ الإنضمام</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => {
                  const classification = getClientClassification(client.order_count);
                  const IconComponent = classification.icon;
                  return (
                    <TableRow key={client.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell>
                        {client.phone ? (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span dir="ltr">{client.phone}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
                            <ShoppingCart className="h-4 w-4 text-primary" />
                          </div>
                          <span className="font-semibold">{client.order_count}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${classification.bgColor} ${classification.textColor} ${classification.borderColor}`}>
                          <IconComponent className="h-4 w-4" />
                          <span className="font-medium text-sm">{classification.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(client.created_at).toLocaleDateString("ar-SA")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Clients;
