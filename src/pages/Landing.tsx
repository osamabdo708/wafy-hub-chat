import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  MessageSquare, 
  Zap, 
  Users, 
  BarChart3, 
  Shield, 
  ArrowLeft,
  Sparkles,
  Check,
  Sun,
  Moon
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import agentIcon from "@/assets/agent-icon.png";
import genieLogo from "@/assets/genie-logo.png";
import { 
  WhatsAppIcon, 
  MessengerIcon, 
  InstagramIcon, 
  TikTokChannelIcon, 
  TelegramIcon 
} from "@/components/ChannelIcons";

const Landing = () => {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const features = [
    {
      icon: MessageSquare,
      title: "صندوق وارد موحد",
      description: "جميع محادثاتك من واتساب، فيسبوك، إنستغرام في مكان واحد"
    },
    {
      icon: Sparkles,
      title: "الذكاء الاصطناعي",
      description: "المارد يرد على عملائك تلقائياً ويُنشئ الطلبات بدون تدخل"
    },
    {
      icon: Users,
      title: "إدارة الفريق",
      description: "أضف وكلاء وموزّع المحادثات بينهم بسهولة"
    },
    {
      icon: BarChart3,
      title: "تقارير متقدمة",
      description: "تابع أداء فريقك وتحليلات المحادثات والمبيعات"
    },
    {
      icon: Shield,
      title: "أمان عالي",
      description: "بياناتك محمية بأحدث تقنيات التشفير"
    },
    {
      icon: Zap,
      title: "سريع وسهل",
      description: "واجهة بسيطة وسريعة تعمل على جميع الأجهزة"
    }
  ];

  const channels = [
    { icon: WhatsAppIcon, name: "واتساب" },
    { icon: MessengerIcon, name: "فيسبوك" },
    { icon: InstagramIcon, name: "إنستغرام" },
    { icon: TikTokChannelIcon, name: "تيك توك" },
    { icon: TelegramIcon, name: "تليجرام" },
  ];

  const pricingPlans = [
    {
      name: "مجاني",
      price: "0",
      description: "للبدء والتجربة",
      features: ["100 محادثة شهرياً", "قناة واحدة", "وكيل واحد", "دعم بالبريد"],
      highlighted: false
    },
    {
      name: "احترافي",
      price: "99",
      description: "للأعمال المتوسطة",
      features: ["محادثات غير محدودة", "جميع القنوات", "5 وكلاء", "المارد AI", "دعم أولوية"],
      highlighted: true
    },
    {
      name: "مؤسسي",
      price: "299",
      description: "للشركات الكبيرة",
      features: ["كل مميزات الاحترافي", "وكلاء غير محدودين", "API مخصص", "مدير حساب مخصص"],
      highlighted: false
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={genieLogo} alt="المارد" className="h-10 w-auto" />
            <span className="text-xl font-bold">المارد</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">تبديل الوضع</span>
            </Button>
            <Button variant="ghost" onClick={() => navigate('/auth')}>
              تسجيل الدخول
            </Button>
            <Button onClick={() => navigate('/auth')} className="gap-2">
              ابدأ مجاناً
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto text-center">
          <Badge className="mb-6 px-4 py-2 text-sm bg-primary/10 text-primary border-primary/20">
            <Sparkles className="w-4 h-4 ml-2" />
            مدعوم بالذكاء الاصطناعي
          </Badge>
          
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            <span className="bg-gradient-to-l from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
              المارد
            </span>
            <br />
            مساعدك الذكي للمحادثات
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-10">
            وحّد جميع قنوات التواصل في مكان واحد، ودع الذكاء الاصطناعي يتولى الردود وإنشاء الطلبات تلقائياً
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Button size="lg" className="text-lg px-8 py-6 gap-2" onClick={() => navigate('/auth')}>
              ابدأ تجربتك المجانية
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 py-6">
              شاهد العرض التوضيحي
            </Button>
          </div>

          {/* Channel Icons */}
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <span className="text-muted-foreground">يدعم:</span>
            {channels.map((channel, index) => (
              <div 
                key={index}
                className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shadow-lg"
              >
                <channel.icon className="w-7 h-7" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Genie Section */}
      <section className="py-20 px-4 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <Badge className="mb-4 bg-purple-500/10 text-purple-600 border-purple-500/20">
                الذكاء الاصطناعي
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                دع المارد يعمل من أجلك
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                المارد مساعد ذكي يفهم محادثات عملائك، يجيب على استفساراتهم، يقترح المنتجات المناسبة، 
                ويُنشئ الطلبات تلقائياً عندما يؤكد العميل الشراء.
              </p>
              <ul className="space-y-4">
                {[
                  "يرد على العملاء في ثوانٍ على مدار الساعة",
                  "يفهم السياق ويتذكر تفاصيل المحادثة",
                  "يقترح المنتجات بناءً على احتياجات العميل",
                  "يُنشئ الطلبات تلقائياً بدون تدخل"
                ].map((item, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center">
                      <Check className="w-4 h-4 text-green-500" />
                    </div>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="order-1 lg:order-2 flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/30 via-blue-500/30 to-green-500/30 rounded-full blur-3xl" />
                <div className="relative w-64 h-64 md:w-80 md:h-80 rounded-full bg-gradient-to-br from-purple-500 via-blue-500 to-green-500 flex items-center justify-center shadow-2xl">
                  <img src={agentIcon} alt="المارد" className="w-40 h-40 md:w-48 md:h-48" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">كل ما تحتاجه في مكان واحد</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              أدوات قوية لإدارة محادثات عملائك وتحويلها إلى مبيعات
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="p-6 hover:shadow-lg transition-shadow group">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">خطط تناسب احتياجاتك</h2>
            <p className="text-lg text-muted-foreground">ابدأ مجاناً وترقّ حسب نمو عملك</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {pricingPlans.map((plan, index) => (
              <Card 
                key={index} 
                className={`p-8 relative ${plan.highlighted ? 'border-primary shadow-xl scale-105' : ''}`}
              >
                {plan.highlighted && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                    الأكثر شيوعاً
                  </Badge>
                )}
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <p className="text-muted-foreground mb-4">{plan.description}</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground"> ر.س/شهرياً</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, fIndex) => (
                    <li key={fIndex} className="flex items-center gap-2">
                      <Check className="w-5 h-5 text-green-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button 
                  className="w-full" 
                  variant={plan.highlighted ? "default" : "outline"}
                  onClick={() => navigate('/auth')}
                >
                  ابدأ الآن
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <Card className="p-12 bg-gradient-to-br from-primary/10 via-purple-500/10 to-pink-500/10 border-none text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">جاهز لتحويل محادثاتك إلى مبيعات؟</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              انضم إلى آلاف الأعمال التي تستخدم المارد لإدارة محادثات عملائها بذكاء
            </p>
            <Button size="lg" className="text-lg px-8 py-6 gap-2" onClick={() => navigate('/auth')}>
              ابدأ تجربتك المجانية الآن
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-border">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src={genieLogo} alt="المارد" className="h-8 w-auto" />
              <span className="font-bold">المارد</span>
            </div>
            <p className="text-muted-foreground text-sm">
              © {new Date().getFullYear()} المارد. جميع الحقوق محفوظة.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;