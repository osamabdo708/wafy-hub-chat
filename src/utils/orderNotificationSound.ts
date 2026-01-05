// Order notification sound utility
import orderNotificationSoundFile from "@/assets/order-notification-sound.mp3";

let audio: HTMLAudioElement | null = null;

export const playOrderNotificationSound = () => {
  try {
    if (!audio) {
      audio = new Audio(orderNotificationSoundFile);
    }
    
    // Reset to start if already playing
    audio.currentTime = 0;
    audio.volume = 0.6;
    audio.play().catch((error) => {
      console.error('[ORDER NOTIFICATION] Error playing sound:', error);
    });

    console.log('[ORDER NOTIFICATION] Sound played');
  } catch (error) {
    console.error('[ORDER NOTIFICATION] Error playing sound:', error);
  }
};
