import type { ReactNode } from "react";

type SessionContainerProps = {
  theme: string;
  users: { name: string; icon: ReactNode }[];
  isSpeak: boolean;
  isOpponentSpeak: boolean;
};

export default function SessionContainer({
  theme,
  users,
  isSpeak,
  isOpponentSpeak,
}: SessionContainerProps) {
  return (
    <section className="stack">
      <h1 className="center">テーマ: {theme}</h1>
      <div className="participants">
        {users.map((user, index) => (
          <div
            className="panel participant"
            data-speaking={index === 0 ? isSpeak : isOpponentSpeak}
            key={index}
          >
            {user.icon}
            <h2>{user.name || "接続待ち"}</h2>
            <small>{index === 0 ? "あなた" : "通話相手"}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
