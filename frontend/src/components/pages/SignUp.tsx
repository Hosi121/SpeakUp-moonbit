import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "../ui/Field";
import { signUp } from "../../services/authService";
import Logo from "../../assets/logo";

export default function SignUp() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await signUp(username, email, password);
      navigate("/login");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "登録できませんでした。",
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
          void submit();
        }}
      >
        <div className="brand-mark">
          <Logo style={{ width: "100%" }} />
        </div>
        <h1 className="center">サインアップ</h1>
        <Input
          label="ユーザー名(セッション時の表示名)"
          autoComplete="nickname"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          label="パスワード"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
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
