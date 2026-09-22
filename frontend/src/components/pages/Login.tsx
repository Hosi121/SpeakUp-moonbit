import { useState } from "react";
import { Link } from "../../navigation/links";
import { navigate } from "../../navigation/location";
import { Input } from "../ui/Field";
import { loadAuth, preloadAuth } from "../../services/authLoader";
import Logo from "../../assets/logo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const login = async (
    email: string,
    password: string,
    form: HTMLFormElement,
  ) => {
    setBusy(true);
    setError("");
    try {
      const { signIn } = await loadAuth();
      if (!form.isConnected) return;
      await signIn(email, password);
      navigate("/home");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "サインインできませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <form
        className="auth-form stack"
        onSubmit={(event) => {
          event.preventDefault();
          void login(email, password, event.currentTarget);
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
          onFocus={preloadAuth}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          label="パスワード"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          onFocus={preloadAuth}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <label className="radio-option">
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(event) => setShowPassword(event.target.checked)}
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
