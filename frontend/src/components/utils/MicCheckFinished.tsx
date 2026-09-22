import { Link } from "../../navigation/links";
import { MicIcon } from "./MicIcon";

export function MicCheckFinished() {
  return (
    <div className="stack center">
      <h1>マイクチェック完了！</h1>
      <p>準備はいいかな？</p>
      <Link className="button primary" to="/sessionlist">
        準備OK!
      </Link>
      <MicIcon />
    </div>
  );
}
