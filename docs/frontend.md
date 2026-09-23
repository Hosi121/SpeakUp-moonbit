# フロントエンド

MoonBit controller が状態と操作規則を所有し、TypeScript が DOM とブラウザ API を操作する。
React / MUI / Router / HTTP の代替ライブラリは持たない。型と資源の基本契約は
[アーキテクチャ](architecture.md)、業務規則は[ドメイン仕様](domain-model.md)を正本とする。

## 責務

| 場所 | 責務 |
| --- | --- |
| [core/shell/app.mbt](../core/shell/app.mbt) | route の同一性、module 待ち、画面・通知 controller の寿命、失敗と復帰 |
| [core/shell/auth.mbt](../core/shell/auth.mbt) | 認証フォーム、先読み、送信段階 |
| [core/presenter](../core/presenter) / [core/thread](../core/thread) | snapshot、下書き、選択、dialog、通信順序、通知・音声 |
| [frontend/src/main.ts](../frontend/src/main.ts) | URL・クリック、History API、dynamic import、mount |
| [dom](../frontend/src/dom) / [message/dom.ts](../frontend/src/message/dom.ts) | 要素生成、差分反映、イベント転送、locale 表示 |
| [services](../frontend/src/services) | fetch、storage、timer、File、WebSocket、WebRTC、AudioContext |
| [styles/app.css](../frontend/src/styles/app.css) | 色、余白、レイアウト |

## Controller と DOM の契約

controller は `get_snapshot / subscribe / start / stop` と具体的な操作を公開する。
フォームは `set_email / set_comment`、通話の dialog は `open_memo / open_topic` 等を使う。
field 名の文字列や DOM event 自体を業務処理へ渡さない。

`get_snapshot` は変更まで同じ参照を返す。更新時は新しい record を発行し、過去の snapshot を変更しない。
利用側も snapshot を変更しない。DOM は node・行 ID の対応・購読解除・子 view の handle を持ち、
フォーム値や通信状態を別の store に複製しない。

入力・audio・dialog を更新ごとに再生成しない。一覧は ID で要素を再利用し、消えた行の controller を破棄する。
input の value が同じなら書き直さず、フォーカス・選択範囲・変換中の入力を保つ。
受信本文は text として表示し、HTML として解釈しない。

`ViewScope` は購読と子 view を所有する。描画失敗でも cleanup を続けて復帰画面へ進む。
標準 `form / dialog / radio / nav` を使い、Enter 送信、Tab / Escape、dialog のフォーカス復帰、
radio の矢印キーはブラウザに任せる。dialog は背景クリックでは閉じない。

## 画面遷移と読み込み

- URL・query・戻る/進む・置換 redirect を維持する。`/` は `/login`、
  `/waiting` と `/sessioninterval` は `/sessionlist`、
  `/trophynotification` は `/stats` へ転送する。
- `/session / /sessionrecord / /sessionfeedback` は conversation query を画面の同一性に含める。
  無関係な query / hash の変更ではフォームを作り直さない。
- 通常のアプリ内クリックだけを処理し、修飾キー・別タブ・download・外部 URL・ページ内 anchor はブラウザへ渡す。
- 画面を離れた時点で旧 controller と media を解放する。遅い module は現在の世代と異なれば mount しない。
- 同期 redirect / mount 失敗でも返された破棄関数を一度だけ実行する。未知の route と chunk 取得失敗には復帰先を表示する。
- token 変更時に通知 controller を入れ替え、ログアウト後の遅い module から通知を開始しない。
- キャッシュされた `pagehide` ではフォームを維持する。単独メッセージ画面は controller を停止・再開する。

認証フォームは小さい `core/shell` の初期 entry に含め、入力時に通信・decoder を先読みする。
送信は module の準備完了を待つ。準備中に画面を離れた場合は送信せず、取得失敗なら再読み込みを案内する。
初期表示を小さくする判断であり、即時送信後の待ち時間は増える場合がある。[比較結果](performance.md#フロントエンド)を参照。

## HTTP と通知

[transport.ts](../frontend/src/services/transport.ts) は応答本文を text として一度読み、
`status / text / failed` を返す。成功・エラーの検査と表示は MoonBit が担当する。

- API path は単一の `/` で始まる相対 path。`//` と backslash を拒否する。
- リクエストごとに最新 token を読む。signin/signup には Bearer を付けず、token を検証してから保存する。
- JSON body があるときだけ Content-Type を付ける。multipart は FormData を渡し、boundary をブラウザに任せる。
- headers 待ち・本文取得を abort できる。中止後の応答は controller が無視する。書き込みは自動再送しない。
- 独立した GET は並列に開始し、同じ要求の組として反映する。片方の失敗では他方も取り消す。

通知は画面間で一つの接続を共有する。100 ms の更新集約、1 / 2 / 4 / 8 / 16 / 30秒の再接続を
MoonBit が制御する。socket error / close の双方で接続の Lifetime を閉じる。
既読応答より新しい一覧がある場合は古い応答で消さず再取得する。
時計補正は HTTP 往復の中点を使い、module 読み込み時間を含めない。

## 音声とメッセージ

ブラウザ handle は具体的操作を持つ `StreamPort / PeerPort / Upload` に包む。
通話の SDP 作成・設定・送信、ICE 待機、mute、音量判定は MoonBit の責務。
SDP / ICE だけを順序付き queue に入れ、会話終了・peer-left・error は保留中の SDP を待たず処理する。
ICE 待機は128件、negotiation queue は256件を上限とし、超過時は接続を解放する。

停止時は peer、socket、stream、AudioContext、audio 要素、animation frame を解放する。
遅いマイク許可と資源の部分初期化失敗も対象。マイク確認は同じ media port を使い、非表示中は描画を止める。

メッセージ controller は下書き・送信・再送キー・過去ページ・既読の進捗を所有する。
送信と過去ページ取得はそれぞれ一つに制限し、停止後・相手変更前の応答を無視する。
表示中の過去の未読もまとめて既読にし、既読失敗を無限再試行しない。

`/message-dom.html?peer=2` は同じ controller を使う単独 DOM 入口。
`npm --prefix frontend run build:message-views` で `_build/message-views` に出力する。
通常の app build とは分け、独自の通知 WebSocket は起動しない。更新通知は host から受け取る。

DOM・IME・BFCache・実音声の検証範囲は[テスト](testing.md#検証範囲)を参照。
