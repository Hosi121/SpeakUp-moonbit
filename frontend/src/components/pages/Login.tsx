import { useMemo } from "react";
import { createAuth } from "../../../../dist/shell.js";
import { authPorts } from "../../services/authLoader";
import { useController } from "../../services/controller";
import { Link } from "../../navigation/links";
import { Input } from "../ui/Field";
import Logo from "../../assets/logo";

export default function Login() {
  const controller = useMemo(() => createAuth(false, authPorts()), []);
  const { email, password, showPassword, error, busy } =
    useController(controller);
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
        <h1 className="center">サインイン</h1>
        <Input
          label="Email"
          type="email"
          autoComplete="username"
          onFocus={controller.preload}
          required
          value={email}
          onChange={(event) =>
            controller.set_field("email", event.target.value)
          }
        />
        <Input
          label="パスワード"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          onFocus={controller.preload}
          required
          value={password}
          onChange={(event) =>
            controller.set_field("password", event.target.value)
          }
        />
        <label className="radio-option">
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(event) => controller.show_password(event.target.checked)}
          />
          入力内容を表示
        </label>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "サインイン中…" : "サインイン"}
        </button>
        <Link className="center" to="/signup">
          サインアップ
        </Link>
      </form>
    </main>
  );
}
