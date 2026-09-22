import { Component, type ReactNode } from "react";
import { Link } from "./links";

export class PageBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="page stack">
          <h1>画面を読み込めませんでした</h1>
          <p role="alert">接続を確認して、もう一度読み込んでください。</p>
          <button type="button" onClick={() => window.location.reload()}>
            再読み込み
          </button>
          <Link to="/login">サインインへ</Link>
        </main>
      );
    return this.props.children;
  }
}
