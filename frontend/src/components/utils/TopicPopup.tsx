import { Dialog } from "../ui/Dialog";

export function TopicPopup({
  isVisible,
  onClose,
  topics,
}: {
  isVisible: boolean;
  onClose: () => void;
  topics: string[];
}) {
  return (
    <Dialog
      open={isVisible}
      onClose={onClose}
      title="まだ話していないトピックはありますか？"
    >
      {topics.length === 0 ? (
        <p>この通話には指定されたトピックがありません。</p>
      ) : (
        <ul className="stack">
          {topics.map((topic, index) => (
            <li key={index}>{topic}</li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
