# UI の構成

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

MUI 削除時には API、会話ライフサイクル、WebRTC adapter、MoonBit / TS2Mbt の公開境界は変更していない。元のピクセル配置を再現する互換移植ではなく、画面の操作目的を保ちながら標準要素へ整理した変更。

## MUI 削除時の build 比較

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

JS は約 40%、JS + CSS の gzip は約 37% 減。52 package を lockfile から削除し、ビルド用 Babel 等の 30 package が dev のみに変わった。CSS-in-JS を通常の CSS に出したため CSS 単体は増えている。これは MUI 削除時の描画層全体の変更の結果であり、MUI 単独の純粋なサイズや実利用者の体感速度を測った値ではない。backend の中継速度とは別の測定。

## Axios の削除（2026-09-23）

HTTP adapter を標準 `fetch` へ置換し、Axios と推移的依存の計 11 package を削除した。代替の HTTP ライブラリは追加せず、残った依存のバージョンも変更していない。認証、HTTP エラー、JSON、画像の multipart 送信を小さな adapter に集約し、成功応答の text を共通 MoonBit decoder へ渡す。ログイン、プロフィール、メモ、イベント、ICE 設定の型も生成した宣言を使う。

| 指標 | Axios 版 (`7cf05a4`) | fetch 版 |
| --- | ---: | ---: |
| JS bundle (minified) | 457.71 kB | 416.98 kB |
| JS gzip | 147.80 kB | 130.62 kB |
| CSS gzip | 2.30 kB | 2.30 kB |
| frontend の直接 runtime 依存 | 4 | 3 |
| lockfile の全 package（root 除外） | 345 | 334 |
| lockfile の non-dev package | 35 | 8 |

JS gzip は 11.6% 減。ローカルの Chromium で実アプリの通知取得と MoonBit decoder を比較したところ、4 条件の中央値は約 6–17% 短縮した。一方、100 件の逐次取得の p95 は 3.3 → 3.6 ms と増えた。実回線や backend の高速化を示す値ではない。[HTTP の契約・測定条件・全結果と再現手順](http-client.md)を参照。

## React Router の削除と画面分割（2026-09-23）

平坦な画面切り替えに使っていた React Router を、History API と React の `useSyncExternalStore` を使う browser adapter へ置換した。React Router の loader / action / nested routing は使っていなかった。既存の URL、戻る・進む、query の変更、新しいタブ、ダウンロード、同じページ内の anchor を維持する。

ログイン／登録は初期 bundle に残し、ほかの画面は `React.lazy` で必要時に読む。遷移先の読み込みを待つ間も、前の画面のマイクや通話接続を解放する。chunk の取得失敗では再読み込みできる画面を表示する。新しい Router ライブラリや polyfill は追加していない。

| 指標 | 変更前 (`4d4dd61`) | 変更後 |
| --- | ---: | ---: |
| ログイン時の JS bytes | 416,975 | 300,700 |
| ログイン時の JS gzip bytes | 130,618 | 94,870 |
| 全画面の JS gzip bytes 合計 | 130,618 | 125,531 |
| frontend の直接 runtime 依存 | 3 | 2 |
| lockfile の全 package（root 除外） | 334 | 228 |
| lockfile の non-dev package | 8 | 5 |

初期 JS gzip は 27.4% 減、全画面を足すと 3.9% 減。後者には chunk 分割による圧縮効率の変化も含む。削除した 106 package のうち 103 は未使用の ESLint plugin / config に由来する開発用依存で、ブラウザの軽量化とは分けて数える。[全測定結果・構成・回帰試験](navigation.md)を参照。

## 残っている TypeScript と依存

| 場所 | 役割 | 判断 |
| --- | --- | --- |
| `frontend/src/components` | React の画面・フォーム・UI 状態 | TS に残す。MUI は不要になった |
| `frontend/src/services/voiceCall.ts`、音量計 | WebRTC / WebSocket / マイク / AudioContext の所有と後始末 | ブラウザ I/O adapter。MoonBit へ移しても Web API 境界は必要 |
| `frontend/src/services/*` | fetch、認証情報、共通 MoonBit decoder の呼び出し | 通信とブラウザ側の状態を TS に残し、応答の型検査と DTO 変換を MoonBit へ |
| `frontend/src/navigation`、`App.tsx` | History API、リンク、画面の読み込みと復帰 | ブラウザ UI adapter。ドメインの DTO は引き続き MoonBit から生成 |
| `server/main.ts`、`server/host.ts` | 比較・互換検証用の Node backend | default の native backend では実行しない |
| `server/migrate.ts`、`server/seed.ts`、scripts/tests | DB 準備、生成、ビルド、検証 | 開発用ツール。常駐サーバーの依存と分ける |

frontend の直接 runtime 依存は React / React DOM の 2 つ。React 自体を外す場合は描画、状態の更新、DOM / Web API bindings の設計が必要であり、サーバーの MoonBit 化とは独立した判断。

通知、フレンド申請の承認・見送り・取消、メッセージ、実績、AI アドバイス、選択式の振り返り、イベント参加・管理を共通 MoonBit API に接続した。固定候補や架空の実績を廃止し、会話履歴と保存済みデータを使う。[各機能のモデル・API・検証](features.md)を参照。

機能追加後、Axios 削除前の JS は約 458 kB / gzip 約 148 kB、CSS 約 7 kB。MUI の表はその削除時点の比較として残す。機能追加に伴う依存パッケージの変更はない。

## 検証

`npm run check`（動的型の監査を含む）、frontend lint、JS/MoonBit/native の既存テスト、JS/native API 結合テストを実行。ブラウザでは実 RTP 音声・再接続・終了・振り返りに加え、ミュート、通話中のメモ・トピック、ダイアログの Tab/Escape/フォーカス復帰、radio の矢印キー、イベント作成、プロフィール保存、ログアウト、マイク解放を確認する。HTTP 置換ではエラー応答、不正なログイン token の拒否、multipart と通話準備中の通信キャンセルも検証する。

320 px / 1024 px で主要画面の横はみ出しを検査し、ログイン・ホーム・通話一覧のスクリーンショットを出力する。自動ブラウザ検証は Chromium。Safari / Firefox 実機、スクリーンリーダーでの評価は未実施。

`npm run test:navigation` は production build を使い、履歴・直開き・query / hash・通常リンクの操作・遅い chunk と戻る操作の競合・chunk 取得失敗からの復帰を検証する。既存ブラウザ試験で検出したメモの初回読み込み競合も修正し、古い応答が編集中の内容を上書きしないことを再現試験で確認する。
