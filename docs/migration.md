# 移植差分

比較元は [Hosi121/SpeakUp](https://github.com/Hosi121/SpeakUp)。
固定 revision と runtime は [contract/source.json](../contract/source.json) を正本とする。
独立した repo と新規 MySQL schema を使い、元の DB・環境設定・アップロード済み画像は引き継がない。
出典とライセンスは [NOTICE.md](../NOTICE.md) を参照。

## 意図的な変更

| 対象 | 採用した動作・理由 |
| --- | --- |
| 通話モデル | イベントと随時通話を同じ会話で扱う。接続・永続状態・本人の振り返りを分離する |
| 参加者 | 会話と二人を一括保存し、同一 event / round の二重割当を seat によらず拒否する |
| 開始・終了 | 双方の media-ready で開始。開始時刻を永続化し、退出・再接続では変更しない。参加者の終了操作またはイベント300秒で終了 |
| 随時通話 | 相手を指定し request_id で並行再送を集約する。招待先も明示的に参加する |
| WebSocket 認証 | room を必須とし、JWT と参加資格を確認してから join |
| callType / signaling | 両者の参加後に通知し、false も明示する。旧 Go の省略された false は受理。方向・交渉状態を検査し、SDP / ICE は元文字列を中継 |
| JWT | RS256、issuer / audience、必須 exp を検証。user_id は正の整数の十進文字列。旧 token は引き継がず再ログイン |
| イベント | 作成は ADMIN / SUPERUSER、長さ30分。timezone なしは UTC、応答も UTC。参加者を凍結して一括公開し、再公開は409 |
| フレンド | 二人につき一行、受信者の同意で成立する。両方向の同時申請は承認とみなさない |
| メッセージ・通知 | 保存・宛先認可・再送時の重複排除を行う。名前ではなく ID で相手を指定する |
| 履歴・実績 | 完了した実際の会話から導出する。旧モック値と取消済み予定は含めない |
| 振り返り・AI | 本人に非公開保存。AI には明示操作で保存済みの文章だけを送り、音声を評価したとは表示しない |
| 空の一覧 | null ではなく空配列 |
| メモ | user_id の UNIQUE と upsert で同時作成を集約する |
| avatar | 2 MiB 上限、画像形式検査、暗号学的乱数の保存名、設定された公開 origin |
| frontend | React / MUI / Router / Axios を標準 DOM / History / fetch に置換。状態・操作規則は MoonBit、型は生成 |
| 取消と再送 | 画面破棄後の応答・module・マイク取得を無効化または解放する。書き込みを通信層で自動再送しない |
| 内部 controller API | field / dialog の文字列指定を具体的な操作関数へ変更し、DOM と生成宣言を同時に更新する |

現行の規則は[ドメイン仕様](domain-model.md)、UI の契約は[フロントエンド](frontend.md)に集約する。
元の不具合を含む完全な動作同値性や、既存サービスへの無停止切替を保証するものではない。

## API の対応

| API / 機能 | 対応 |
| --- | --- |
| signup / signin | Supabase adapter。ローカルは明示的な開発用認証 |
| profile / update / avatar / user search / memo | 保存と本人の認可 |
| events / register / match / roster | 参加ビット、マッチング、管理画面、相手と待機の表示 |
| ws / rooms / rtc-config | 認証付き signaling、期限付き TURN credentials |
| conversations / direct / finish / cancel / reflection | イベント・随時の共通 API。start は内部 WS controller 専用 |
| conversations/history | 直近100件の互換配列。新しい page API で古い履歴を取得 |
| topics / sessions / session_history | 互換 API。session_history はイベント限定、新 UI は共通会話履歴を使用 |
| friends / messages / notifications / stats / learning | 保存・認可・集計・画面を実装 |

旧モックの `/conversation_history` HTTP API は公開しない。同名の画面 URL は維持する。
独立した web-rtc-test の試作はコピーせず、本体の通話経路を使う。

## 互換性の根拠

[contract](../contract/levels.md) の凍結した TS / Go を実行して expected を生成する。
DTO・文字列・wire payload の JSON 構造を比較し、現行 JS の実呼び出しと TypeScript consumer も検査する。
fixture は現行実装へ合わせて書き換えない。全 endpoint の旧稼働環境への replay や、
JS prototype / 内部 ABI までの互換性は検証対象外。

## 未対応・未検証

| 項目 | 状態 |
| --- | --- |
| 元の Go/Ent DB の直接移行、本番 rollout | 未実施。移植用 DB の更新のみ[開発手順](development.md#移植用-db-の更新)で対応 |
| アプリ全体の PostgreSQL / SQLite 対応 | 未実装。汎用ライブラリの DB 対応とは区別する |
| OS Web Push / メール通知 | 未実装。アプリを開いている間の通知のみ |
| 複数 signaling サーバー、通知のサーバー間配送 | 未実装。単一プロセスの状態管理 |
| RTP のサーバー中継・SFU・録音・文字起こし | 対象外 |
| Supabase / OpenAI 実サービス、TURN 実回線 | 未検証。ローカル fixture と host candidate の通話試験を使用 |
| Safari / Firefox 実機、スクリーンリーダー | 未検証 |
| 本番負荷、外部回線の capacity | 未計測。[性能測定](performance.md)の比較条件に限定 |
