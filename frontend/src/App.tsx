import { lazy, Suspense, type ComponentType } from "react";
import { ActivityLayout } from "./services/ActivityLayout";
import { useLocation } from "./navigation/location";
import { Link, Redirect } from "./navigation/links";
import { PageBoundary } from "./navigation/PageBoundary";
import Login from "./components/pages/Login";
import SignUp from "./components/pages/SignUp";

// Keep authentication available without a second JS request; load other screens on entry.
const pages = new Map<string, ComponentType>([
  ["/login", Login],
  ["/signup", SignUp],
  [
    "/home",
    lazy(() =>
      import("./components/pages/Home").then((m) => ({ default: m.Home })),
    ),
  ],
  [
    "/settings",
    lazy(() =>
      import("./components/pages/Settings").then((m) => ({
        default: m.Settings,
      })),
    ),
  ],
  [
    "/events",
    lazy(() =>
      import("./components/pages/Events").then((m) => ({ default: m.Events })),
    ),
  ],
  [
    "/sessionlist",
    lazy(() =>
      import("./components/pages/SessionList").then((m) => ({
        default: m.SessionList,
      })),
    ),
  ],
  [
    "/miccheck",
    lazy(() =>
      import("./components/pages/MicCheck").then((m) => ({
        default: m.MicCheck,
      })),
    ),
  ],
  [
    "/session",
    lazy(() =>
      import("./components/pages/Session").then((m) => ({
        default: m.Session,
      })),
    ),
  ],
  [
    "/sessionrecord",
    lazy(() => import("./components/pages/SessionRecordForm")),
  ],
  [
    "/record",
    lazy(() =>
      import("./components/pages/Record").then((m) => ({ default: m.Record })),
    ),
  ],
  [
    "/memo",
    lazy(() =>
      import("./components/pages/Memo").then((m) => ({ default: m.Memo })),
    ),
  ],
  [
    "/stats",
    lazy(() =>
      import("./components/pages/Stats").then((m) => ({ default: m.Stats })),
    ),
  ],
  [
    "/conversation_history",
    lazy(() =>
      import("./components/pages/ConversationHistory").then((m) => ({
        default: m.ConversationHistory,
      })),
    ),
  ],
  ["/admin", lazy(() => import("./components/pages/adminPage"))],
  ["/friendlist", lazy(() => import("./components/utils/FriendList"))],
  [
    "/session_history_friendlist",
    lazy(() =>
      import("./components/pages/SessionHistoryFriendlist").then((m) => ({
        default: m.SessionHistoryFriendlist,
      })),
    ),
  ],
  ["/friendrequest", lazy(() => import("./components/pages/FriendRequest"))],
  [
    "/sessionfeedback",
    lazy(() => import("./components/pages/SessionFeedback")),
  ],
]);
const Message = lazy(() =>
  import("./components/pages/Message").then((m) => ({ default: m.Message })),
);
const redirects = new Map([
  ["/", "/login"],
  ["/waiting", "/sessionlist"],
  ["/sessioninterval", "/sessionlist"],
  ["/trophynotification", "/stats"],
]);

function Screen({ pathname }: { pathname: string }) {
  const redirect = redirects.get(pathname);
  if (redirect) return <Redirect to={redirect} />;
  const Page = pages.get(pathname);
  if (Page) return <Page />;
  const match = /^\/message\/([^/]+)$/.exec(pathname);
  if (match) return <Message friendId={match[1]} />;
  return (
    <main className="page stack">
      <h1>ページが見つかりません</h1>
      <Link to="/home">ホームへ</Link>
      <Link to="/login">サインインへ</Link>
    </main>
  );
}

export default function App() {
  const url = useLocation();
  let pathname: string;
  try {
    pathname = decodeURI(url.pathname).replace(/\/+$/, "").toLowerCase() || "/";
  } catch {
    pathname = "";
  }
  return (
    <ActivityLayout>
      <PageBoundary key={pathname}>
        {/* A new boundary unmounts the previous call even while its destination loads. */}
        <Suspense
          fallback={
            <main className="page">
              <p role="status">画面を読み込み中…</p>
            </main>
          }
        >
          <Screen pathname={pathname} />
        </Suspense>
      </PageBoundary>
    </ActivityLayout>
  );
}
