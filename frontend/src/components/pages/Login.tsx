import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "../ui/Field";
import { signIn } from "../../services/authService";
import Logo from "../../assets/logo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const login = async (email: string, password: string) => {
    setBusy(true);
    setError("");
    try {
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
          void login(email, password);
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
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          label="パスワード"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
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
