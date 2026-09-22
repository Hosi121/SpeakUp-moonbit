import { useMemo } from "react";
import { createSettings, browserPorts } from "../../../../dist/presenter.js";
import { useController } from "../../services/controller";
import { uploadFile } from "../../services/upload";
import { BottomNavigationTemplate } from "../templates/BottomNavigationTemplate";
import TopSection from "../utils/TopSection";
import { Avatar } from "../ui/Avatar";
import { Input } from "../ui/Field";
export function Settings() {
  const controller = useMemo(() => createSettings(browserPorts()), []);
  const view = useController(controller);
  const { editing, draft, busy, error } = view;
  const user = view.loaded ? view.user : null;
  const { save, set_draft: setDraft } = controller;
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
                  if (file) controller.upload(uploadFile(file));
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
                        onClick={() => controller.edit("")}
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
                        controller.edit(field);
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
            controller.logout();
          }}
        >
          ログアウト
        </button>
      </div>
    </BottomNavigationTemplate>
  );
}
