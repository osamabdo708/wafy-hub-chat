import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QrCode } from "lucide-react";
import messengerIcon from "@/assets/messenger-icon.png";
import whatsappIcon from "@/assets/whatsapp-icon.png";
import telegramIcon from "@/assets/telegram-icon.png";

interface ChannelQRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: {
    messenger?: string;
    whatsapp?: string;
    telegram?: string;
  };
}

const ChannelQRDialog = ({ open, onOpenChange, channels }: ChannelQRDialogProps) => {
  const channelConfigs = [
    {
      key: 'messenger',
      name: 'Messenger',
      icon: messengerIcon,
      qrUrl: channels.messenger,
    },
    {
      key: 'whatsapp',
      name: 'WhatsApp',
      icon: whatsappIcon,
      qrUrl: channels.whatsapp,
    },
    {
      key: 'telegram',
      name: 'Telegram',
      icon: telegramIcon,
      qrUrl: channels.telegram,
    },
  ].filter(c => c.qrUrl);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5" />
            رموز QR للتواصل
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {channelConfigs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <QrCode className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>لا توجد قنوات مضافة</p>
              <p className="text-sm">قم بإضافة قنوات التواصل من الإعدادات</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {channelConfigs.map((channel) => (
                <div 
                  key={channel.key}
                  className="flex flex-col items-center gap-3 p-4 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-2">
                    <img src={channel.icon} alt={channel.name} className="w-6 h-6" />
                    <span className="font-medium">{channel.name}</span>
                  </div>
                  <div className="bg-white p-3 rounded-lg">
                    <img 
                      src={channel.qrUrl} 
                      alt={`${channel.name} QR Code`}
                      className="w-40 h-40 object-contain"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ChannelQRDialog;