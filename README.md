# Sakefolio

日本酒のラベル画像・味わい・香り・飲酒記録を、各自の Google アカウントで管理する AppSheet アプリのMVPです。

## 現在の構成

- アプリ：Google AppSheet（作成・画面設定は AppSheet エディタ）
- データ：Google Sheets（Brands / Bottles / Reviews / Photos / Tags の5テーブル）
- 写真：各利用者の Google Drive（AppSheet Image 型）
- 銘柄マスター：[さけのわデータ](https://sakenowa.com) の公開API
- AIラベル認識：将来の拡張機能。MVPでは写真の保存のみ

## 作成済みデータソース

[AppSheet MVP 用 Google スプレッドシート](https://docs.google.com/spreadsheets/d/1cBNEjeYFZMbmumXSckBLrRfQAKqWRzFnofUo6TWyBZs/edit)

## 起動方法

1. [AppSheet](https://www.appsheet.com/) に自分の Google アカウントでログイン。
2. **Create > App > Start with existing data** で上記スプレッドシートを選ぶ。
3. 5テーブルを追加し、`docs/APPSHEET_SETUP.md` の列型・View・参照設定を反映。
4. スプレッドシートの **拡張機能 > Apps Script** で `scripts/appsscript/Code.gs` を貼り付け、`refreshSakenowaBrands` を実行して銘柄を取り込む。
5. AppSheet を再同期して動作確認。

**注意：このリポジトリをPushするだけでは AppSheet アプリは自動生成されません。** AppSheetエディタへの設定・実機テストは別途必要です。

## 家族への配布

各利用者はアプリとデータを**コピー**し、自分の Sheets / Drive で運用します。データ・画像のコピー先が各自の Drive になっていることを確認してください。単なるアプリ共有では同一データソースを参照する可能性があります。

- [AppSheet 構築手順](docs/APPSHEET_SETUP.md)
- [データモデル](docs/DATA_MODEL.md)
- [検証・受入項目](docs/QA.md)

## ライセンス・出典

公開銘柄マスターは [さけのわデータ](https://sakenowa.com) を利用します。表示箇所には「さけのわデータを利用しています」の帰属表示とリンクを設けます。元データを自分の創作物として再配布しないでください。
