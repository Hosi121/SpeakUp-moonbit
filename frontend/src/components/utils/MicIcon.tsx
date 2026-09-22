import HomeLogo from "../../assets/homeLogo";
import { Icon } from "../ui/Icon";

export function MicIcon() {
  return (
    <div className="brand-mark stack compact">
      <HomeLogo />
      <Icon name="mic" size={36} />
    </div>
  );
}
