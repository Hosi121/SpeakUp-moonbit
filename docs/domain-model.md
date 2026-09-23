# ドメイン仕様

## 通話・接続・振り返り

| 対象 | 保存・寿命 | 規則 |
| --- | --- | --- |
| Conversation | DB に永続化 | 二人の参加者、開始・終了・取消、任意のイベントとラウンド |
| Signaling room | プロセス内 | 現在の接続と SDP / ICE の交渉。切断しても会話を終了しない |
| Reflection | 会話 ID と本人 ID ごとに保存 | 本人だけが読み書きでき、通話相手にも公開しない |

[Conversation](../core/conversation/model.mbt) は検証済みの非公開 fields を持つ。
`Phase` が必要な時刻を保持し、revision は状態から導出する。

| 状態 | 保持する時刻 | revision | 許可する変更 |
| --- | --- | ---: | --- |
| Planned | なし | 0 | 開始、取消 |
| Active | 開始 | 1 | 終了、イベント期限終了 |
| Completed | 開始・終了 | 2 | なし。終了の再送は既存値を返す |
| Cancelled | 取消 | 1 | なし。取消の再送は既存値を返す |

開始済みへの開始再送も既存値を返す。変更は参加者に限定し、終了時刻は開始時刻より前にしない。
会話の ID と参加者 ID は別の型で、wire の整数を検証してから構築する。

## 随時通話とイベント

`Origin` は `Direct` または `Event(event_id, round)`。モデルにはラウンド数の上限を置かず、
イベント API の生成ポリシーを3ラウンド・通話300秒とする。随時通話には期限を付けない。

随時通話は対象ユーザーを選んで作る。`(user_id, request_id)` の UNIQUE で並行再送を同じ会話へ集約し、
同じキーで相手を変えた要求は409にする。招待先は自分で参加とマイク許可を選ぶ。

イベントは参加ビットを保存し、マッチング開始時に event 行をロックして参加者を凍結する。
会話・二人の参加行・公開マーカーを同じ transaction に保存する。
公開失敗は再実行可能、公開済みはペアがゼロでも409。rank 順とラウンドごとの回転で組み、
奇数の一人は待機する。全員の公平性・全ラウンドの重複最小性は保証しない。

開始は双方の `media-ready` がそろったときにサーバーへ保存する。
これはブラウザの `connectionState === 'connected'` の申告であり、サーバーによる RTP 検査ではない。
開始 API は WebSocket controller 専用で、HTTP からは呼べない。

イベント期限は開始 + 300秒。サーバーが約1秒間隔・最大100件ずつ永続状態を調べて終了させる。
再起動後も期限超過分を回復し、期限後の手動終了も同じ時刻へ収束する。
DB 障害時は再試行するため、厳密な時刻での実行は保証しない。画面の時計は通知 API のサーバー時刻で補正する。

## 保存と競合

- `conversation_members` の seat は0/1。二人を同じ transaction で作る。
- `UNIQUE(event_id, round_no, user_id)` で、seat の位置によらず同一ラウンドへの二重割当を拒否する。
- 状態変更は `WHERE revision=?` による CAS と会話ごとの処理順序で保護する。再送で時刻を更新しない。
- `conversation_reflections` は `(conversation_id, user_id)` の upsert。履歴は Completed の会話から読み、別表へ複製しない。
- 通話一覧は本人の membership から二人とテーマを JOIN する。振り返りを行ごとに読む N+1 は行わない。

## 履歴ページング

| API | 応答 |
| --- | --- |
| `GET /conversations/history` | 互換用の直近100件の配列 |
| `GET /conversations/history/page` | 最初のページ |
| `GET /conversations/history/page/{cursor}` | 続きのページ |

ページの応答は `{ "items": [...], "next_cursor": "..." }`。空の cursor が終端。
本人の membership で絞り、`ended_at DESC, id DESC` で101件取得して100件を返す。
cursor は `v1.<ended_at>.<id>` で、次ページはその組より古い行を読む。
同時刻、新着追加、cursor 行の削除でも OFFSET に依存しない。全ページを固定した DB snapshot ではない。

画面は取得済みの行を保ち、失敗時は同じ cursor から再試行する。
稼働中通話・通知の100件制限と、フレンド候補に用いる直近の通話履歴は別の一覧として扱う。

## フレンドとメッセージ

[friendship](../core/friendship/model.mbt) は
`Absent / Pending(requester) / Accepted(requester) / Declined(requester) / Blocked` を持つ。
二人の ID を順序付け、受信者だけが承認・見送り、申請者だけが取消できる。
双方から申請しても自動承認しない。見送り・取消後は再申請でき、再送を別の参加者の同意に変えない。

API は純粋な `decide` の結果を revision と照合し、更新と通知を同じ transaction に保存する。
競合時は読み直し、最大4回で安定しなければ409。
初回 INSERT の重複時も no-op UPDATE で排他ロックを取り、共有ロックからの昇格を避ける。

承認済みの二人だけが `/message/:friendId` で送受信できる。
本文は最大2,000 UTF-16 code units。空白判定は ECMAScript の WhiteSpace / LineTerminator に合わせる。
`(sender_id, request_id)` で再送を集約し、同じキーの本文・相手変更は409。
最新50件と `before/:id` で過去を読み、既読操作は本人宛ての行だけを変更する。

フレンド候補は実際の通話履歴とユーザー検索から作る。

## 通知

申請・承認、通話招待、イベントの相手決定、メッセージを、元の書込みと同じ transaction で保存する。
event key で重複を防ぐ。`GET /notifications` は本人宛て最新100件・未読総数・サーバー時刻を
同じ SQL 文から返す。既読操作も本人の通知に限定する。

[Notice](../core/shared/notifications.mbt) の各 variant が遷移に必要な ID を持つ。
通話通知には会話 ID、メッセージには送信者とメッセージ ID が必要で、欠落した入力は拒否する。
説明・遷移先は enum の match から求める。旧 `projectNotification` は互換用に残す。

`/activity` は token と有効なユーザーを確認し、本人向けの `{"type":"refresh"}` だけを送る。
本文は認証付き HTTP で取得する。再接続・タブ再表示・表示中の60秒間隔で DB を読み直し、
commit 後に更新通知だけが失われても回復する。通話 signaling とは独立した接続である。

## 振り返り・実績・AI

満足度・感想・学んだ表現と6問の選択回答を、会話 ID と本人 ID に紐付けて保存する。
`GET /stats` は完了した会話から通話数、種類、相手人数、累計時間、振り返り数を集計する。
取消・未終了の会話は数えない。

AI へ送るのは、本人が生成ボタンを押した際の保存済み感想・学んだ表現だけ。
録音・文字起こしはなく、音声や会話能力を評価したとは表示しない。
結果は本人だけに保存し、同じ入力には既存結果を返す。編集後は古い結果と区別し、
生成中の編集があれば旧入力の結果を新しい内容として保存しない。
AI 未設定時は503になるが、通常の振り返り保存は利用できる。

[移植との差分・未対応範囲](migration.md)、[DB 更新手順](development.md#移植用-db-の更新)を参照。
