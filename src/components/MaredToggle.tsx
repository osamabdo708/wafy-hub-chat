import { Switch } from "@/components/ui/switch";
import maredIcon from "@/assets/mared-icon.png";

interface MaredToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export const MaredToggle = ({ enabled, onChange, disabled }: MaredToggleProps) => {
  return (
    <div className="flex items-center gap-2">
      <img 
        src={maredIcon} 
        alt="المارد" 
        className={`w-6 h-6 transition-opacity ${enabled ? 'opacity-100' : 'opacity-40'}`}
      />
      <Switch
        checked={enabled}
        onCheckedChange={onChange}
        disabled={disabled}
        className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-purple-500 data-[state=checked]:to-pink-500"
      />
    </div>
  );
};
