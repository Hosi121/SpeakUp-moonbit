import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
} from "react-router-dom";
import { ActivityLayout } from "./services/ActivityLayout";
import { Events } from "./components/pages/Events";
import App from "./App.tsx";
import { Settings } from "./components/pages/Settings.tsx";
import { Home } from "./components/pages/Home.tsx";
import { SessionList } from "./components/pages/SessionList.tsx";
import { MicCheck } from "./components/pages/MicCheck.tsx";
import { Session } from "./components/pages/Session.tsx";
import SessionRecordForm from "./components/pages/SessionRecordForm.tsx";
import SignUp from "./components/pages/SignUp.tsx";
import { Record } from "./components/pages/Record.tsx";
import { Memo } from "./components/pages/Memo.tsx";
import { Message } from "./components/pages/Message.tsx";
import SessionFeedback from "./components/pages/SessionFeedback.tsx";
import FriendRequest from "./components/pages/FriendRequest.tsx";
import Login from "./components/pages/Login.tsx";
import { Stats } from "./components/pages/Stats.tsx";
import { ConversationHistory } from "./components/pages/ConversationHistory.tsx";
import AdminPage from "./components/pages/adminPage.tsx";
import FriendList from "./components/utils/FriendList.tsx";
import "./styles/app.css";
import { SessionHistoryFriendlist } from "./components/pages/SessionHistoryFriendlist.tsx";
import TrophyNotification from "./components/pages/TrophyNotification.tsx";

const router = createBrowserRouter([
  {
    element: <ActivityLayout />,
    children: [
      { path: "events", element: <Events /> },
      {
        path: "/",
        element: <App />,
      },
      {
        path: "settings",
        element: <Settings />,
      },
      {
        path: "login",
        element: <Login />,
      },
      {
        path: "home",
        element: <Home />,
      },
      {
        path: "sessionlist",
        element: <SessionList />,
      },
      {
        path: "waiting",
        element: <Navigate to="/sessionlist" replace />,
      },
      {
        path: "miccheck",
        element: <MicCheck />,
      },
      {
        path: "session",
        element: <Session />,
      },
      {
        path: "sessioninterval",
        element: <Navigate to="/sessionlist" replace />,
      },
      {
        path: "sessionrecord",
        element: <SessionRecordForm />,
      },
      {
        path: "signup",
        element: <SignUp />,
      },
      {
        path: "record",
        element: <Record />,
      },
      {
        path: "memo",
        element: <Memo />,
      },
      {
        path: "message/:friendId",
        element: <Message />,
      },
      {
        path: "stats",
        element: <Stats />,
      },
      {
        path: "conversation_history",
        element: <ConversationHistory />,
      },
      {
        path: "admin",
        element: <AdminPage />,
      },
      {
        path: "friendlist",
        element: <FriendList />,
      },
      {
        path: "session_history_friendlist",
        element: <SessionHistoryFriendlist />,
      },
      {
        path: "friendrequest",
        element: <FriendRequest />,
      },
      {
        path: "sessionfeedback",
        element: <SessionFeedback />,
      },
      {
        path: "trophynotification",
        element: <TrophyNotification />,
      },
    ],
  },
]);

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
} else {
  console.error("Failed to find the root element");
}
