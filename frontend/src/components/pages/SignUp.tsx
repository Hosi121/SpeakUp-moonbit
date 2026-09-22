import { useMemo } from "react";
import { createAuth } from "../../../../dist/shell.js";
import { authPorts } from "../../services/authLoader";
import { useController } from "../../services/controller";
import { Link } from "../../navigation/links";
import { Input } from "../ui/Field";
import Logo from "../../assets/logo";

export default function SignUp() {
  const controller = useMemo(() => createAuth(true, authPorts()), []);
  const { username, email, password, error, busy } = useController(controller);
  return (
    <main className="auth-page">
      <form
        className="auth-form stack"
        onSubmit={(event) => {
          event.preventDefault();
          controller.submit();
        }}
      >
        <div className="brand-mark">
          <Logo style={{ width: "100%" }} />
        </div>
        <h1 className="center">サインアップ</h1>
        <Input
          label="ユーザー名(セッション時の表示名)"
          autoComplete="nickname"
          onFocus={controller.preload}
          required
          value={username}
          onChange={(event) =>
            controller.set_field("username", event.target.value)
          }
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          onFocus={controller.preload}
          required
          value={email}
          onChange={(event) =>
            controller.set_field("email", event.target.value)
          }
        />
        <Input
          label="パスワード"
          type="password"
          autoComplete="new-password"
          onFocus={controller.preload}
          required
          minLength={8}
          value={password}
          onChange={(event) =>
            controller.set_field("password", event.target.value)
          }
        />
        <small>パスワードは8文字以上で入力してください。</small>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        <button className="primary" type="submit" disabled={busy}>
          メールを送信して仮登録
        </button>
        <Link className="center" to="/login">
          ログインページに戻る
        </Link>
      </form>
    </main>
  );
}
