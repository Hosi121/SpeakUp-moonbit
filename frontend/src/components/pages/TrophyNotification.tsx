import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";

export default function TrophyNotification() {
  return (
    <main className="auth-page">
      <div className="panel stack center">
        <h1 className="accent">トロフィー獲得！</h1>
        <div>
          <Icon name="trophy" size={160} />
        </div>
        <p>初めてのセッションに参加</p>
        <Link className="button" to="/home">
          ホームへ
        </Link>
      </div>
    </main>
  );
}
