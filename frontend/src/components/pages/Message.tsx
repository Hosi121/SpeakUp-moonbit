import { useMemo } from "react";
import { createBrowserThread } from "../../../../dist/thread.js";
import { MessageView } from "../../message/react";
import TopSection from "../utils/TopSection";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";

/** The app shell supplies markup; the controller owns the message screen. */
export function Message({ friendId }: { friendId: string }) {
  const controller = useMemo(() => createBrowserThread(friendId), [friendId]);
  return (
    <BottomNavigationTemplate value="other">
      <div className="page stack">
        <TopSection />
        <MessageView controller={controller} />
      </div>
    </BottomNavigationTemplate>
  );
}
