import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
import TopSection from "../utils/TopSection";
import { Avatar } from "../ui/Avatar";
import { Input } from "../ui/Field";
import type { UserProfile } from "../../types/types";
import {
  fetchUserProfile,
  updateUserProfile,
  uploadAvatar,
} from "../../services/userService";

export function Settings() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [editing, setEditing] = useState<"username" | "email" | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    void fetchUserProfile()
      .then(setUser)
      .catch(() => setError("ユーザー情報を取得できませんでした。"));
  }, []);
  const save = async () => {
    if (!editing || !user) return;
    setBusy(true);
    setError("");
    try {
      await updateUserProfile({ [editing]: draft });
      setUser({ ...user, [editing]: draft });
      setEditing(null);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "保存できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const avatarUrl = await uploadAvatar(file);
      setUser((user) => user && { ...user, avatarUrl });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "画像をアップロードできませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomNavigationTemplate value="other">
      <div className="page stack">
        <TopSection />
        <h1>設定</h1>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        {!user && !error && <p role="status">読み込み中…</p>}
        {user && (
          <section className="panel stack">
            <div className="row">
              <Avatar src={user.avatarUrl} name={user.username} large />
              <Input
                label="プロフィール画像"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.target.value = "";
                }}
              />
            </div>
            {(["username", "email"] as const).map((field) => (
              <div key={field} className="stack compact">
                {editing === field ? (
                  <form
                    className="stack compact"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void save();
                    }}
                  >
                    <Input
                      label={
                        field === "username" ? "ユーザー名" : "メールアドレス"
                      }
                      type={field === "email" ? "email" : "text"}
                      required
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      autoFocus
                      disabled={busy}
                    />
                    <div className="row">
                      <button type="submit" disabled={busy} className="primary">
                        保存
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditing(null)}
                      >
                        キャンセル
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="row between">
                    <div className="grow">
                      <small>
                        {field === "username" ? "ユーザー名" : "メールアドレス"}
                      </small>
                      <p>{user[field]}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={
                        field === "username"
                          ? "ユーザー名を編集"
                          : "メールアドレスを編集"
                      }
                      onClick={() => {
                        setDraft(user[field]);
                        setEditing(field);
                      }}
                    >
                      編集
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem("token");
            navigate("/login", { replace: true });
          }}
        >
          ログアウト
        </button>
      </div>
    </BottomNavigationTemplate>
  );
}
