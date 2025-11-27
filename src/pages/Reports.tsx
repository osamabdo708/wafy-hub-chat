import { Card } from "@/components/ui/card";
import { BarChart3, TrendingUp, Users, MessageSquare } from "lucide-react";

const Reports = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">التقارير والتحليلات</h1>
        <p className="text-muted-foreground mt-1">رؤى شاملة لأداء عملك</p>
      </div>

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
