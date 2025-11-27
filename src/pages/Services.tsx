import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Briefcase, Clock } from "lucide-react";

const mockServices = [
  {
    id: 1,
    name: "جلسة مساج علاجي",
    category: "صحة وعافية",
    price: "200 ريال",
    duration: "60 دقيقة",
    description: "جلسة مساج علاجي متخصصة لتخفيف آلام العضلات"
  },
  {
    id: 2,
    name: "استشارة تغذية",
    category: "استشارات",
    price: "150 ريال",
    duration: "45 دقيقة",
    description: "استشارة مع أخصائي تغذية معتمد"
  },
  {
    id: 3,
    name: "جلسة يوغا",
    category: "رياضة",
    price: "100 ريال",
    duration: "90 دقيقة",
    description: "جلسة يوغا جماعية مع مدرب محترف"
  }
];

const Services = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">الخدمات</h1>
          <p className="text-muted-foreground mt-1">إدارة الخدمات المقدمة</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 ml-2" />
          إضافة خدمة
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">إجمالي الخدمات</p>
              <h3 className="text-2xl font-bold mt-1">24</h3>
            </div>
            <Briefcase className="w-8 h-8 text-primary" />
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">نشطة</p>
              <h3 className="text-2xl font-bold mt-1 text-success">20</h3>
            </div>
            <Briefcase className="w-8 h-8 text-success" />
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">متوقفة مؤقتاً</p>
              <h3 className="text-2xl font-bold mt-1 text-warning">4</h3>
            </div>
            <Briefcase className="w-8 h-8 text-warning" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockServices.map((service) => (
          <Card key={service.id} className="p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg mb-2">{service.name}</h3>
                <Badge variant="secondary">{service.category}</Badge>
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground mb-4">
              {service.description}
            </p>
            
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span>{service.duration}</span>
              </div>
              <p className="text-2xl font-bold text-primary">{service.price}</p>
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1">تعديل</Button>
              <Button className="flex-1">حجز</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Services;
