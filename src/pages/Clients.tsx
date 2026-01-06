import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, Phone, Mail, ShoppingCart } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  order_count: number;
}

type ClientClassification = "جديد" | "عادي" | "متكرر" | "VIP";

const getClientClassification = (orderCount: number): { label: ClientClassification; variant: "default" | "secondary" | "outline" | "destructive" } => {
  if (orderCount >= 10) return { label: "VIP", variant: "default" };
  if (orderCount >= 5) return { label: "متكرر", variant: "secondary" };
  if (orderCount >= 2) return { label: "عادي", variant: "outline" };
  return { label: "جديد", variant: "outline" };
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">عملاء VIP</CardTitle>
            <Badge variant="default">VIP</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-16" /> : vipClients}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">عملاء متكررين</CardTitle>
            <Badge variant="secondary">متكرر</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-16" /> : repeatingClients}</div>
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
                <TableRow>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right">الهاتف</TableHead>
                  <TableHead className="text-right">البريد الإلكتروني</TableHead>
                  <TableHead className="text-right">عدد الطلبات</TableHead>
                  <TableHead className="text-right">التصنيف</TableHead>
                  <TableHead className="text-right">تاريخ الإنضمام</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => {
                  const classification = getClientClassification(client.order_count);
                  return (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell>
                        {client.phone ? (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {client.phone}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {client.email ? (
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            {client.email}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <ShoppingCart className="h-3 w-3 text-muted-foreground" />
                          {client.order_count}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={classification.variant}>{classification.label}</Badge>
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
