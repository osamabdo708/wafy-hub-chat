// Notification sound utility using audio file
import notificationSoundFile from "@/assets/notification-sound.mp3";

let audio: HTMLAudioElement | null = null;

export const playNotificationSound = () => {
  try {
    if (!audio) {
      audio = new Audio(notificationSoundFile);
    }
    
    // Reset to start if already playing
    audio.currentTime = 0;
    audio.volume = 0.5;
    audio.play().catch((error) => {
      console.error('[NOTIFICATION] Error playing sound:', error);
    });

    console.log('[NOTIFICATION] Sound played');
  } catch (error) {
    console.error('[NOTIFICATION] Error playing sound:', error);
  }
};
