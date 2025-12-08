import messengerIcon from '@/assets/messenger-icon.png';
import instagramIcon from '@/assets/instagram-icon.png';
import whatsappIcon from '@/assets/whatsapp-icon.png';
import tiktokIcon from '@/assets/tiktok-icon.png';
import telegramIcon from '@/assets/telegram-icon.png';

interface ChannelIconProps {
  className?: string;
}

export const MessengerIcon = ({ className = "w-4 h-4" }: ChannelIconProps) => (
  <img src={messengerIcon} alt="Messenger" className={className} />
);

export const InstagramIcon = ({ className = "w-4 h-4" }: ChannelIconProps) => (
  <img src={instagramIcon} alt="Instagram" className={className} />
);

export const WhatsAppIcon = ({ className = "w-4 h-4" }: ChannelIconProps) => (
  <img src={whatsappIcon} alt="WhatsApp" className={className} />
);

export const TikTokChannelIcon = ({ className = "w-4 h-4" }: ChannelIconProps) => (
  <img src={tiktokIcon} alt="TikTok" className={className} />
);

export const TelegramIcon = ({ className = "w-4 h-4" }: ChannelIconProps) => (
  <img src={telegramIcon} alt="Telegram" className={className} />
);

// Helper function to get icon by channel name
export const getChannelIconComponent = (channel: string, className?: string) => {
  switch (channel) {
    case 'facebook':
      return <MessengerIcon className={className} />;
    case 'instagram':
      return <InstagramIcon className={className} />;
    case 'whatsapp':
      return <WhatsAppIcon className={className} />;
    case 'tiktok':
      return <TikTokChannelIcon className={className} />;
    case 'telegram':
      return <TelegramIcon className={className} />;
    default:
      return null;
  }
};
