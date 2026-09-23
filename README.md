# SpeakUp MoonBit

[SpeakUp](https://github.com/Hosi121/SpeakUp) の独立した MoonBit 実装です。
イベントのラウンド通話と随時の1対1通話を同じモデルで扱い、フレンド、メッセージ、
通知、本人だけの振り返りを提供します。

backend は MoonBit native、frontend の状態・通信制御は MoonBit の JS target です。
TypeScript は DOM 描画とブラウザ API を担当します。frontend の実行時 npm 依存はありません。

## 起動

Linux x86_64、Node 24.13.0 以上、C compiler、MariaDB Connector/C・OpenSSL、Docker Compose が必要です。
[開発手順](docs/development.md)にインストール、初回起動、開発用アカウント、環境変数を記載しています。
通常の開発コマンドは `npm run dev`、画面は `http://localhost:5173/login` です。

## ドキュメント

| 文書 | 内容 |
| --- | --- |
| [アーキテクチャ](docs/architecture.md) | 責務、型共有、I/O 境界、資源の所有と設計判断 |
| [ドメイン仕様](docs/domain-model.md) | 通話、参加、フレンド、履歴、通知、振り返りの規則 |
| [フロントエンド](docs/frontend.md) | controller と DOM、画面遷移、HTTP、音声の契約 |
| [開発手順](docs/development.md) | セットアップ、ビルド、設定、移植用 DB の更新 |
| [テスト](docs/testing.md) | 型と試験の役割、実行コマンド、CI |
| [性能測定](docs/performance.md) | 比較条件、結果、制約、再現方法と生データ |
| [移植差分](docs/migration.md) | 元の SpeakUp との互換性、意図的な変更、未対応範囲 |
| [依存関係](docs/dependencies.md) | 公開ライブラリとアプリの分担、配布元、更新方針 |

## 対応範囲

運用 DB は MySQL、signaling と通知は単一サーバーを前提にします。
元の Go/Ent DB の移行、OS Web Push、本番配備は対象外です。
Go 比較用実装より高速という測定結果は得られていません。[測定の範囲](docs/performance.md)を参照してください。

元コード・画像の出典とライセンスの扱いは [NOTICE.md](NOTICE.md) に記載しています。
