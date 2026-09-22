import { Link } from "../../navigation/links";
import { Icon } from "../ui/Icon";

export type mainBottomNavigation = "record" | "home" | "session" | "other";

export function MainBottomNavigation({
  value,
}: {
  value: mainBottomNavigation;
}) {
  return (
    <nav className="bottom-navigation" aria-label="メインナビゲーション">
      <Link to="/record" aria-current={value === "record" ? "page" : undefined}>
        <Icon name="book" />
        記録
      </Link>
      <Link to="/home" aria-current={value === "home" ? "page" : undefined}>
        <Icon name="home" />
        ホーム
      </Link>
      <Link
        to="/sessionlist"
        aria-current={value === "session" ? "page" : undefined}
      >
        <Icon name="mic" />
        通話
      </Link>
    </nav>
  );
}
