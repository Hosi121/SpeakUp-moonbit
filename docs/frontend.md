# UI の構成と移植の残り

React は描画とブラウザのライフサイクルを担当し、会話モデル・状態検査・共通 DTO は MoonBit から JS と型宣言を生成して利用する。native backend には React / MUI / Node のランタイム依存はない。

## MUI の削除

`@mui/material`、`@mui/lab`、`@mui/icons-material`、`@emotion/react`、`@emotion/styled` を manifest と lockfile から削除した。代替 UI ライブラリ、CSS framework、アイコンパッケージは追加していない。

- `frontend/src/styles/app.css` に色・余白・レイアウトを集約。`sx`、ThemeProvider、CSS-in-JS、MUI 互換レイヤーはない。黄色とピンクの配色・既存ロゴを維持し、文字用のピンクを暗くした。
- 画面は `button`、`form`、`input`、`textarea`、`nav`、`article` を直接使う。`components/ui` はラベル付き入力、アバター、必要な SVG アイコン、ダイアログ、選択肢だけを扱い、native DOM の具体的な型で公開する。
- モーダルは [`dialog.showModal()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal) を使う。フォーカス制限・背景の inert 化・閉じた後のフォーカス復帰をブラウザに任せる。閉じるボタンと Escape に対応し、背景クリックでは閉じない。
- 従来のタブは `fieldset` / `legend` / 同名 radio の選択肢へ。矢印キーの操作はブラウザ標準。ARIA の tab ウィジェットや独自のキーボード操作を再実装しない。
- 下部ナビゲーションには操作名、現在ページ、ミュート状態を付けた。狭い画面でも折り返し、safe-area 分の余白を確保する。アニメーションする波は静的な SVG へ変更した。
- フォーム送信、エラー表示、アバターの file input、ログアウト後の画面遷移を整えた。空の Vite デモ画面は `/login` への遷移に置換した。外部フォントのリクエストも削除した。
- マイクチェックでは二重のマイク取得をやめ、非同期取得後に画面が閉じていた場合を含め、全 track・AudioContext・animation frame を解放する。非表示タブでは音量描画を止める。

API、会話ライフサイクル、WebRTC adapter、MoonBit / TS2Mbt の公開境界は変更していない。元のピクセル配置を再現する互換移植ではなく、画面の操作目的を保ちながら標準要素へ整理した変更。

## 同じ環境での build 比較

変更前は `f6bfee4`。Node 24.13.0 / Vite 7.3.6、同じ lockfile の残存パッケージと production build を比較した。MUI を削除する際に残存パッケージのバージョン更新はない。

| 指標 | 変更前 | 変更後 |
| --- | ---: | ---: |
| JS bundle (minified) | 707.90 kB | 421.53 kB |
| JS gzip | 228.75 kB | 141.42 kB |
| CSS bundle | 1.54 kB | 6.81 kB |
| CSS gzip | 0.56 kB | 2.25 kB |
| JS + CSS gzip | 229.31 kB | 143.67 kB |
| Vite が変換した module | 12,090 | 152 |
| frontend の直接 runtime 依存 | 9 | 4 |
| lockfile の全 package（root 除外） | 397 | 345 |
| lockfile の non-dev package | 117 | 35 |

JS は約 40%、JS + CSS の gzip は約 37% 減。52 package を lockfile から削除し、ビルド用 Babel 等の 30 package が dev のみに変わった。CSS-in-JS を通常の CSS に出したため CSS 単体は増えている。これは今回の描画層全体の変更の結果であり、MUI 単独の純粋なサイズや実利用者の体感速度を測った値ではない。backend の中継速度とは別の測定。

## 残っている TypeScript と依存

| 場所 | 役割 | 判断 |
| --- | --- | --- |
| `frontend/src/components` | React の画面・フォーム・UI 状態 | TS に残す。MUI は不要になった |
| `frontend/src/services/voiceCall.ts`、音量計 | WebRTC / WebSocket / マイク / AudioContext の所有と後始末 | ブラウザ I/O adapter。MoonBit へ移しても Web API 境界は必要 |
| `frontend/src/services/*` | HTTP、認証情報、モック、画面固有の DTO 変換 | 一部の変換は共通 MoonBit 済み。全 service が MoonBit という意味ではない |
| `server/main.ts`、`server/host.ts` | 比較・互換検証用の Node backend | default の native backend では実行しない |
| `server/migrate.ts`、`server/seed.ts`、scripts/tests | DB 準備、生成、ビルド、検証 | 開発用ツール。常駐サーバーの依存と分ける |

frontend の直接 runtime 依存は React / React DOM / React Router / Axios。次に依存を減らすなら HTTP adapter の Axios を標準 fetch に置換できるが、認証ヘッダー・エラー応答・multipart の契約を検証する別変更になる。React 自体を外す場合は描画、状態の更新、DOM / Web API bindings の設計が必要であり、サーバーの MoonBit 化とは独立した判断。

移植残とは別に、旧通知の承認・拒否、実績、AI feedback、旧 `/sessionfeedback` の回答、`/message/:friendname` の相手への実メッセージ送信は未実装。旧 `/friendrequest` の候補も固定 ID の試作のまま。動作のなかったボタンは無効化または削除した。共通会話モデルの `/sessionrecord` にある本人の振り返りは実際に保存する。イベント参加・マッチング API の管理 UI 全面統合も残る。

## 検証

`npm run check`（動的型の監査を含む）、frontend lint、JS/MoonBit/native の既存テスト、JS/native API 結合テストを実行。ブラウザでは実 RTP 音声・再接続・終了・振り返りに加え、ミュート、通話中のメモ・トピック、ダイアログの Tab/Escape/フォーカス復帰、radio の矢印キー、イベント作成、プロフィール保存、ログアウト、マイク解放を確認する。

320 px / 1024 px で主要画面の横はみ出しを検査し、ログイン・ホーム・通話一覧のスクリーンショットを出力する。自動ブラウザ検証は Chromium。Safari / Firefox 実機、スクリーンリーダーでの評価は未実施。
