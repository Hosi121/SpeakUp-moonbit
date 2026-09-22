import { IconButton } from "../utils/IconButton";
import { Icon } from "../ui/Icon";
import TopSection from "../utils/TopSection";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";

export function Record() {
  return (
    <BottomNavigationTemplate value="record">
      <div className="page stack">
        <TopSection />
        <h1>記録</h1>
        <div className="grid">
          <IconButton
            icon={<Icon name="book" size={48} />}
            text="会話の記録"
            url="conversation_history"
          />
          <IconButton
            icon={<Icon name="folder" size={48} />}
            text="履歴"
            url="session_history_friendlist"
          />
          <IconButton
            icon={<Icon name="trophy" size={48} />}
            text="データ"
            url="stats"
          />
          <IconButton
            icon={<Icon name="note" size={48} />}
            text="持ち込みメモ"
            url="memo"
          />
        </div>
      </div>
    </BottomNavigationTemplate>
  );
}
