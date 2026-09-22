import { Link } from "../../navigation/links";
import { Icon } from "../ui/Icon";
import NotificationModal from "./NotificationModal";

export default function TopSection() {
  return (
    <header className="top-section">
      <NotificationModal />
      <Link to="/home" aria-label="SpeakUp ホーム">
        SpeakUp
      </Link>
      <Link to="/settings" className="button icon-button" aria-label="設定">
        <Icon name="settings" size={28} />
      </Link>
    </header>
  );
}
