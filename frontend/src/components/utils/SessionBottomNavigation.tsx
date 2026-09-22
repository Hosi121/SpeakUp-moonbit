import { Icon } from "../ui/Icon";

export type SessionBottomNavigationProps = {
  isMute: boolean;
  toggleMute: () => void;
  setMemoOpen: (open: boolean) => void;
  setAssistantOpen: (open: boolean) => void;
  onPriorityHighClick: () => void;
};

export function SessionBottomNavigation({
  isMute,
  toggleMute,
  setMemoOpen,
  setAssistantOpen,
  onPriorityHighClick,
}: SessionBottomNavigationProps) {
  return (
    <nav className="bottom-navigation" aria-label="通話の操作">
      <button
        type="button"
        onClick={toggleMute}
        aria-label="マイクをミュート"
        aria-pressed={isMute}
      >
        <Icon name={isMute ? "muted" : "mic"} />
        {isMute ? "ミュート中" : "マイク"}
      </button>
      <button
        type="button"
        onClick={() => setMemoOpen(true)}
        aria-haspopup="dialog"
      >
        <Icon name="message" />
        メモ
      </button>
      <button
        type="button"
        onClick={() => setAssistantOpen(true)}
        aria-haspopup="dialog"
      >
        <Icon name="search" />
        アシスタント
      </button>
      <button
        type="button"
        onClick={onPriorityHighClick}
        aria-haspopup="dialog"
      >
        <Icon name="topic" />
        トピック
      </button>
    </nav>
  );
}
