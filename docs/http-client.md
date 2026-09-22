# HTTP adapter と Axios 削除の比較

2026-09-23、frontend の Axios を標準 `fetch` に置き換えた。この比較時点の直接 runtime 依存は React / React DOM / React Router。続く [画面遷移の整理](navigation.md)で React Router も削除した。以下は Axios 削除時点の測定記録。

## 通信と型の境界

[`httpClient.ts`](../frontend/src/services/httpClient.ts) はブラウザ I/O を担当する。各 service は [`request.ts`](../frontend/src/services/request.ts) に HTTP method・パス・具体的な decoder を渡す。成功した body は text として一回読み、MoonBit が JSON 構造を検査して DTO / 画面用の型を返す。通知取得などの旧 `request` も text を受けていたため、比較結果を JSON の二重パース解消によるものとは扱わない。

```ts
request("GET", "/user/info", parseProfile);
request("GET", "/rtc-config", parseIceServers, undefined, { signal });
```

`request<T>` の `T` は decoder の戻り値から推論する。型引数だけで未知の JSON を DTO とみなす API は持たない。プロフィール、ユーザー検索、メモ、ログイン、登録、イベント作成、アバター、AI 応答、ICE 設定も [`core/shared/http_responses.mbt`](../core/shared/http_responses.mbt) の decoder に揃えた。公開型は Mbt2TS で生成し、重複していた TS DTO 定義を削除した。

| 契約 | 動作 |
| --- | --- |
| 接続先 | `VITE_API_URL`、未指定なら `/api`。`/` から始まる API パスを base に追加する |
| 認証 | リクエストごとに最新 token を読む。signin/signup は `authenticated: false` で送る |
| JSON | body のある要求だけ `Content-Type: application/json`。書き込みは一回送信し、自動再送しない |
| multipart | `FormData` をそのまま渡し、boundary と Content-Type はブラウザに任せる |
| HTTP エラー | `response.ok` を検査。`ApiError` に status / code / data を残し、文字列の message / error / detail を表示 |
| 通信失敗・中止 | cause を保持し、`ERR_NETWORK` / `ERR_CANCELED` で区別。headers 待ちと body 読み取りの両方を abort できる |
| 応答なしの成功 | command は body を読み切り、204 でも JSON parse しない |
| 不正な応答 | MoonBit decoder が拒否。小数・範囲外 ID の切り捨て、型の違う token の保存を防ぐ |
| 互換性 | memo の欠落/null は空文字にする。ICE の URL は string / string[] を受け、具体的な RTCConfiguration を作る |

通話 adapter は自分の `AbortController` を所有し、退出時に会話取得と ICE 設定の通信を中止する。キャンセル後にマイクを取得せず、通常の退出を接続エラーとして表示しない。

fetch が HTTP 4xx/5xx では reject しない点は [MDN の fetch 説明](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)、multipart の境界は [MDN の FormData 説明](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects)に従う。Axios の汎用機能全体を作り直すものではなく、現在の SpeakUp の通信契約に範囲を絞った adapter。

## サイズと依存

Node 24.13.0 / Vite 7.3.6 の production build。同じ残存パッケージのバージョンを使い、応答 decoder の追加も含む今回の変更全体を比較した。

| 指標 | Axios 1.20.0 | fetch |
| --- | ---: | ---: |
| JS bytes | 457,706 | 416,975 |
| JS gzip bytes | 147,802 | 130,618 |
| CSS bytes / gzip bytes | 6,966 / 2,295 | 6,966 / 2,295 |
| lockfile packages（root 除外） | 345 | 334 |
| non-dev packages | 35 | 8 |
| 直接 runtime dependencies | 4 | 3 |

JS gzip は 17,184 bytes（11.6%）減。lockfile から 11 package を削除し、ほかの 16 package は dev のみになった。Node 用 adapter の依存も含む lockfile の個数と、ブラウザに入るコード量は区別する。

## ブラウザでの実測

[`bench/http-client.mjs`](../bench/http-client.mjs) が実アプリの `fetchInbox` と共通 MoonBit decoder を bundle し、Chromium から同じローカル HTTP サーバに要求する。fixture は日本語を含む正規の通知 DTO。1 件は 217 bytes、100 件は 17,728 bytes。同時要求 1 / 6 の各条件で 20 batch を 8 round、warm-up の 1 round を除外して測定する。Axios/fetch の順序を round ごとに入れ替え、`Cache-Control: no-store` とサーバ側の要求件数検査でキャッシュや重複送信を除く。時間は fetchInbox の呼び出しから型付き応答を受け取るまで。

環境: Linux、Intel Core Ultra 7 255H、Node v24.13.0、Chromium 153.0.8010.12。headless、loopback HTTP/1.1。生の集計値と build metadata は [`bench/http-client-results.json`](../bench/http-client-results.json)。

| 通知数 | 同時要求 | 要求数 / client | 中央値 ms（Axios → fetch） | p95 ms（Axios → fetch） | req/s（Axios → fetch） |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 160 | 2.3 → 1.9 | 3.4 → 2.9 | 419.4 → 503.6 |
| 1 | 6 | 960 | 4.5 → 4.0 | 7.6 → 7.0 | 869.0 → 893.4 |
| 100 | 1 | 160 | 2.3 → 2.1 | 3.3 → 3.6 | 418.1 → 434.8 |
| 100 | 6 | 960 | 5.4 → 5.1 | 8.9 → 8.5 | 715.1 → 720.2 |

この実行では中央値は約 6–17% 短縮したが、100 件を逐次取得した p95 は悪化した。単一環境の短い測定で信頼区間は算出していないため、全条件で高速化したとは主張しない。DB、native backend、TLS、実回線、初回 bundle ダウンロード、React 描画は測っていない。実利用での応答時間はそれらにも依存する。

保存した metadata は変更前・変更後とも HEAD が `7cf05a4` で dirty。変更前は測定スクリプト追加のみ、変更後はこの HTTP 置換の未コミット状態を capture した。production asset の hash / bytes と各依存を同時に保存し、before bundle は `_build` 内だけに置く。Axios を現在の manifest に測定用として再追加しない。

## 再現

[README の toolchain 準備](../README.md#起動)を行った新旧二つの checkout を使う。旧 checkout は `7cf05a4b043b5ff1bd5c42ffb820912696a1fc6d` に固定する。それぞれで `npm ci`、`npm --prefix frontend ci`、MoonBit の install/update 後、次を実行する。DB や `.env` は不要。

```bash
npm run build:core
npm --prefix frontend run build
```

変更後の checkout から、旧 checkout のパスを指定して比較する。

```bash
npx playwright install chromium
node bench/http-client.mjs capture axios-before /path/to/axios-checkout
node bench/http-client.mjs capture fetch-after
node bench/http-client.mjs compare axios-before fetch-after
```

集計は `_build/http-client-bench/axios-before-vs-fetch-after.json` に出力する。異なる環境で数値が同じになるとは限らない。

## 回帰試験

- `tests/http-client.test.mjs`: 実 HTTP で base path / 認証 / JSON / multipart / 204 / HTTP エラー / 切断 / body 途中の abort を確認。
- `tests/http-contracts.test.mjs`: 実際に生成された MoonBit JS に、不正な ID・ログイン token・メモ・AI 応答・ICE 設定を渡す。
- `tests/browser/http.spec.mjs`: 401 の表示、公開ログインに Bearer を付けないこと、不正 token で保存済み認証を上書きしないこと、通話準備中の中止を Chromium で確認。
- 既存の JS/native API とブラウザ試験: ログイン、プロフィール・画像保存、メモ、イベント作成、随時／イベントの実 RTP 通話、再接続、終了、振り返りを確認。
