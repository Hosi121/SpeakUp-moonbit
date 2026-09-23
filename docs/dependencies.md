# 依存関係

バージョンの正本は [moon.mod](../moon.mod)、[package-lock.json](../package-lock.json)、
[frontend/package-lock.json](../frontend/package-lock.json)。生成ツールと compiler は固定版を使う。

## 配布元と責務

| 依存 | 用途・配布元 |
| --- | --- |
| `moonbitlang/async` | [公式](https://github.com/moonbitlang/async)の HTTP / WebSocket、TaskGroup、キャンセル |
| `Hosi121/sql_session` | 接続貸出、transaction、キャンセルの寿命管理 |
| `Hosi121/mysql` | native MySQL adapter。MariaDB Connector/C を使用 |
| `Hosi121/ws_session` | WebSocket の bounded writer と終了処理 |
| `Hosi121/lifetime` | 同期的な資源所有と一度だけの解放。async / DOM 依存なし |
| `Hosi121/lifetime_js` | JS callback と公式 async の接続、取消中の資源受け渡し |
| `jose / mysql2 / ws` | 比較用 Node backend と DB 準備。frontend には配信しない |
| `@mizchi/ts` | TS2Mbt / Mbt2TS の生成ツール |
| TypeScript / Vite / ESLint / Prettier / Playwright | 開発・ビルド・検証 |

SQL / MySQL / WebSocket は [moonbit-sessions](https://github.com/Hosi121/moonbit-sessions)、
Lifetime は [moonbit-lifetime](https://github.com/Hosi121/moonbit-lifetime) の Apache-2.0 公開 module を
Mooncakes から取得する。submodule やアプリ内の実装コピーは持たない。
SpeakUp 本体のライセンスへ依存ライブラリのライセンスを適用しない。[NOTICE.md](../NOTICE.md)を参照。

## アプリとライブラリの境界

| 判断 | 理由 |
| --- | --- |
| SQL session と DB adapter を分ける | 寿命・transaction を共有し、Value / Row / SQL 方言は driver に残す |
| 既存の PostgreSQL client / pool、moondb driver をライブラリ側で利用する | DB 実装を重複保有しない。SpeakUp 本体は MySQL module のみ使用 |
| WebSocket の Session は connection ID を持たない | ID・部屋・signaling の規則は SpeakUp の責務 |
| 数値検査、文字列 callback 規約、JS 分割処理はアプリに残す | 現行 wire / compiler / export 形式に固有 |
| frontend の実行時 npm 依存は0 | DOM / History / fetch の必要な操作を adapter に限定する。汎用 framework 全体は再実装しない |

PostgreSQL の adapter・独立 consumer・実 DB 検証はライブラリ repo が担当する。
SpeakUp の SQL/schema の可搬性や PostgreSQL 対応を意味しない。
先行実装との分担は [sessions の設計](https://github.com/Hosi121/moonbit-sessions/blob/main/docs/design.md)、
[lifetime の設計](https://github.com/Hosi121/moonbit-lifetime/blob/main/docs/design.md)を参照。

## 更新方針

汎用機能の修正は公開元で実装・配布検証してから release し、アプリの依存バージョンを更新する。
ライブラリ内部のテストは公開元、公開版との API / 通話の結合は SpeakUp の CI で検証する。

compiler / async / TS2Mbt の更新では、JS ABI と native の取消・close の契約を再検証する。
特に compiler 出力に依存する JS 分割は、未対応の初期化や export を自動で許可しない。

npm の監査は root と frontend の lockfile を別々に対象とする。
`npm audit` / `npm --prefix frontend audit` で確認し、更新時の検証範囲は[テスト](testing.md)に従う。
