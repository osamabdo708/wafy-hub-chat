import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Clock, User } from "lucide-react";

const mockConversations = [
  {
    id: 1,
    customer: "أحمد محمد",
    channel: "واتساب",
    lastMessage: "هل يمكنني معرفة السعر؟",
    time: "منذ 5 دقائق",
    unread: 2,
    status: "جديد"
  },
  {
    id: 2,
    customer: "فاطمة علي",
    channel: "فيسبوك",
    lastMessage: "متى يمكنني الحصول على الخدمة؟",
    time: "منذ 15 دقيقة",
    unread: 0,
    status: "مفتوح"
  },
  {
    id: 3,
    customer: "خالد سعيد",
    channel: "إنستغرام",
    lastMessage: "شكراً جزيلاً",
    time: "منذ ساعة",
    unread: 0,
    status: "مغلق"
  }
];

const Inbox = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">البريد الوارد الموحد</h1>
          <p className="text-muted-foreground mt-1">جميع محادثاتك من كل القنوات في مكان واحد</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">تصفية</Button>
          <Button>محادثة جديدة</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          {mockConversations.map((conversation) => (
            <Card 
              key={conversation.id} 
              className="p-4 cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{conversation.customer}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {conversation.channel}
                    </Badge>
                  </div>
                </div>
                {conversation.unread > 0 && (
                  <Badge className="bg-primary">{conversation.unread}</Badge>
                )}
              </div>
              
              <p className="text-sm text-muted-foreground mb-2">
                {conversation.lastMessage}
              </p>
              
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {conversation.time}
                </div>
                <Badge variant={
                  conversation.status === "جديد" ? "default" :
                  conversation.status === "مفتوح" ? "secondary" :
                  "outline"
                }>
                  {conversation.status}
                </Badge>
              </div>
            </Card>
          ))}
        </div>

        <Card className="lg:col-span-2 p-6">
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <MessageSquare className="w-16 h-16 text-muted-foreground" />
            <div>
              <h3 className="text-xl font-semibold mb-2">اختر محادثة</h3>
              <p className="text-muted-foreground">
                اختر محادثة من القائمة للبدء في الرد على العملاء
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Inbox;
