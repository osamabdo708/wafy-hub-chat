import { Card } from "@/components/ui/card";
import { BarChart3, TrendingUp, Users, MessageSquare, DollarSign, ShoppingBag } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ar } from "date-fns/locale";

const Reports = () => {
  // Fetch sales data - orders with status "مكتمل" or "تم التوصيل" are considered sales
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ["sales-report"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: workspace } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_user_id", user.id)
        .single();

      if (!workspace) return null;

      // Fetch orders that are considered sales
      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, price, status, created_at, source_platform, products(name), services(name)")
        .eq("workspace_id", workspace.id)
        .in("status", ["مكتمل", "تم التوصيل"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Calculate statistics
      const totalSales = orders?.reduce((sum, order) => sum + (order.price || 0), 0) || 0;
      const totalOrders = orders?.length || 0;
      
      // Calculate today's sales
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todaySales = orders?.filter(o => new Date(o.created_at) >= today)
        .reduce((sum, order) => sum + (order.price || 0), 0) || 0;
      const todayOrdersCount = orders?.filter(o => new Date(o.created_at) >= today).length || 0;

      // Calculate this month's sales
      const monthStart = startOfMonth(new Date());
      const monthEnd = endOfMonth(new Date());
      const monthSales = orders?.filter(o => {
        const date = new Date(o.created_at);
        return date >= monthStart && date <= monthEnd;
      }).reduce((sum, order) => sum + (order.price || 0), 0) || 0;
      const monthOrdersCount = orders?.filter(o => {
        const date = new Date(o.created_at);
        return date >= monthStart && date <= monthEnd;
      }).length || 0;

      // Last 7 days sales
      const last7Days = subDays(new Date(), 7);
      const weekSales = orders?.filter(o => new Date(o.created_at) >= last7Days)
        .reduce((sum, order) => sum + (order.price || 0), 0) || 0;
      const weekOrdersCount = orders?.filter(o => new Date(o.created_at) >= last7Days).length || 0;

      // Recent sales (last 10)
      const recentSales = orders?.slice(0, 10) || [];

      // Sales by source
      const sourceBreakdown: Record<string, { count: number; total: number }> = {};
      orders?.forEach(order => {
        const source = order.source_platform || 'غير محدد';
        if (!sourceBreakdown[source]) {
          sourceBreakdown[source] = { count: 0, total: 0 };
        }
        sourceBreakdown[source].count += 1;
        sourceBreakdown[source].total += order.price || 0;
      });

      return {
        totalSales,
        totalOrders,
        todaySales,
        todayOrdersCount,
        monthSales,
        monthOrdersCount,
        weekSales,
        weekOrdersCount,
        recentSales,
        sourceBreakdown,
      };
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">التقارير والتحليلات</h1>
        <p className="text-muted-foreground mt-1">رؤى شاملة لأداء عملك</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">المحادثات الإجمالية</p>
              <h3 className="text-2xl font-bold mt-1">1,284</h3>
              <p className="text-xs text-success flex items-center gap-1 mt-1">
                <TrendingUp className="w-3 h-3" />
                +12% عن الشهر الماضي
              </p>
            </div>
            <MessageSquare className="w-8 h-8 text-primary" />
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">العملاء النشطون</p>
              <h3 className="text-2xl font-bold mt-1">892</h3>
              <p className="text-xs text-success flex items-center gap-1 mt-1">
                <TrendingUp className="w-3 h-3" />
                +8% عن الشهر الماضي
              </p>
            </div>
            <Users className="w-8 h-8 text-success" />
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">معدل الاستجابة</p>
              <h3 className="text-2xl font-bold mt-1">4.2 دقيقة</h3>
              <p className="text-xs text-success flex items-center gap-1 mt-1">
                <TrendingUp className="w-3 h-3" />
                تحسن بنسبة 15%
              </p>
            </div>
            <BarChart3 className="w-8 h-8 text-accent" />
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">رضا العملاء</p>
              <h3 className="text-2xl font-bold mt-1">94%</h3>
              <p className="text-xs text-success flex items-center gap-1 mt-1">
                <TrendingUp className="w-3 h-3" />
                +3% عن الشهر الماضي
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-warning" />
          </div>
        </Card>
      </div>

      {/* Sales Report Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          تقرير المبيعات
        </h2>
        
        {/* Sales KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-6 bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">مبيعات اليوم</p>
                <h3 className="text-2xl font-bold mt-1 text-green-600">
                  {salesLoading ? "..." : `${salesData?.todaySales?.toFixed(2) || 0} ₪`}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {salesData?.todayOrdersCount || 0} طلب
                </p>
              </div>
              <ShoppingBag className="w-8 h-8 text-green-600" />
            </div>
          </Card>
          
          <Card className="p-6 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">مبيعات الأسبوع</p>
                <h3 className="text-2xl font-bold mt-1 text-blue-600">
                  {salesLoading ? "..." : `${salesData?.weekSales?.toFixed(2) || 0} ₪`}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {salesData?.weekOrdersCount || 0} طلب
                </p>
              </div>
              <ShoppingBag className="w-8 h-8 text-blue-600" />
            </div>
          </Card>
          
          <Card className="p-6 bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">مبيعات الشهر</p>
                <h3 className="text-2xl font-bold mt-1 text-purple-600">
                  {salesLoading ? "..." : `${salesData?.monthSales?.toFixed(2) || 0} ₪`}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {salesData?.monthOrdersCount || 0} طلب
                </p>
              </div>
              <ShoppingBag className="w-8 h-8 text-purple-600" />
            </div>
          </Card>
          
          <Card className="p-6 bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي المبيعات</p>
                <h3 className="text-2xl font-bold mt-1 text-amber-600">
                  {salesLoading ? "..." : `${salesData?.totalSales?.toFixed(2) || 0} ₪`}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {salesData?.totalOrders || 0} طلب مكتمل
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-amber-600" />
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by Source */}
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">المبيعات حسب المصدر</h3>
          <div className="space-y-4">
            {salesData?.sourceBreakdown && Object.entries(salesData.sourceBreakdown).length > 0 ? (
              Object.entries(salesData.sourceBreakdown).map(([source, data]) => {
                const percentage = salesData.totalOrders > 0 
                  ? Math.round((data.count / salesData.totalOrders) * 100) 
                  : 0;
                const colorMap: Record<string, string> = {
                  'POS': 'bg-blue-500',
                  'المتجر': 'bg-emerald-500',
                  'store': 'bg-emerald-500',
                  'default': 'bg-primary'
                };
                const color = colorMap[source] || colorMap.default;
                
                return (
                  <div key={source}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{source}</span>
                      <span className="text-sm text-muted-foreground">
                        {data.count} طلب - {data.total.toFixed(2)} ₪
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className={`${color} h-2 rounded-full`}
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-muted-foreground text-center py-4">لا توجد مبيعات بعد</p>
            )}
          </div>
        </Card>

        {/* Recent Sales */}
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">آخر المبيعات</h3>
          <div className="space-y-3">
            {salesData?.recentSales && salesData.recentSales.length > 0 ? (
              salesData.recentSales.map((sale, index) => (
                <div key={sale.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-muted-foreground w-6">
                      {index + 1}
                    </span>
                    <div>
                      <span className="font-medium">
                        {sale.products?.name || sale.services?.name || 'طلب'}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(sale.created_at), 'PPp', { locale: ar })}
                      </p>
                    </div>
                  </div>
                  <span className="font-bold text-green-600">{sale.price} ₪</span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-center py-4">لا توجد مبيعات بعد</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">التوزيع حسب القناة</h3>
          <div className="space-y-4">
            {[
              { name: "واتساب", count: 542, percentage: 42, color: "bg-success" },
              { name: "فيسبوك", count: 385, percentage: 30, color: "bg-primary" },
              { name: "إنستغرام", count: 257, percentage: 20, color: "bg-accent" },
              { name: "تليجرام", count: 100, percentage: 8, color: "bg-warning" }
            ].map((channel) => (
              <div key={channel.name}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{channel.name}</span>
                  <span className="text-sm text-muted-foreground">{channel.count} محادثة</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className={`${channel.color} h-2 rounded-full`}
                    style={{ width: `${channel.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">المنتجات الأكثر طلباً</h3>
          <div className="space-y-4">
            {[
              { name: "جلسة مساج علاجي", orders: 89 },
              { name: "منتج العناية بالبشرة", orders: 67 },
              { name: "استشارة تغذية", orders: 54 },
              { name: "جلسة يوغا", orders: 42 },
              { name: "زيت الأرغان", orders: 38 }
            ].map((item, index) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="font-medium">{item.name}</span>
                </div>
                <span className="text-sm text-muted-foreground">{item.orders} طلب</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">خريطة توزيع العملاء</h3>
        <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
          <p className="text-muted-foreground">سيتم دمج خريطة Google Maps هنا</p>
        </div>
      </Card>
    </div>
  );
};

export default Reports;