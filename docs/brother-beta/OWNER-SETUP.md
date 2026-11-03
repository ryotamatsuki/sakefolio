# Brother Beta：所有者が行う設定

この手順は少人数の受入試験用です。
すべて合格するまで義兄へ利用開始URLを渡さないでください。
コードをマージしても旧GitHub Pagesには自動公開しません。
Cloudflareの契約・課金・Googleの公開ステータスは自動変更しません。

## 1. 専用の無料配信先

採用候補はCloudflare Pagesの静的配信（Functions、Workers、データベース、独自ドメイン購入なし）。
無料の `https://PROJECT.pages.dev` を使用します。

| 選択肢 | 分離 | HTTPヘッダー | 判定 |
|---|---|---|---|
| 既存の `ryotamatsuki.github.io/sakefolio/` | 他アプリと同一オリジン | 任意CSPなどを設定不可 | 不採用 |
| 作成済みの `sakefolio-beta-lab.github.io` | 専用オリジンを確保可能 | 同上 | 今回の要件を満たさない |
| Cloudflare Pagesの専用プロジェクト | 専用オリジン | `_headers`で設定 | 第一候補 |
| Netlify等の静的ホスティング | 専用オリジンを確保可能 | 設定可能なサービスあり | 今回は構成・現行無料条件を検証していない |

2026-11-03の実ブラウザ確認ではCloudflareはサインイン画面でした。
既存のCloudflareアカウントがあるかは未確認です。
所有者がログイン（必要なら無料アカウント作成・規約確認）し、Workers & Pages → Pages → Direct UploadでSakefolio専用プロジェクトを作成してください。
production branchを `brother-beta` にします。
CLIを選ぶ場合は、Cloudflare公式Wranglerから `pages project create PROJECT --production-branch=brother-beta` を使用できます。
別のアプリやユーザー投稿HTML/JSをこのオリジンへ配置しないでください。

Git連携とDirect Uploadは後から切替できない制約があるため、今回の手動承認付きCI方式ではDirect Uploadを選びます。
Cloudflare上で実際のプロジェクト名と正式URLを確認してから次へ進みます。
例示URLを実配信済みURLとして扱わないでください。

## 2. GitHubの設定

リポジトリの Settings → Environments に `brother-beta` を作成し、所有者をrequired reviewerに設定します。
環境設定を作るだけでは承認制にならないため、保護ルールも確認してください。
その環境に次のSecretsを登録してください。
トークンをチャットやIssueへ貼らないでください。

| 種類 | 名前 | 値 |
|---|---|---|
| Environment secret | `CLOUDFLARE_API_TOKEN` | 対象アカウントのCloudflare Pages編集権限に限定したAPIトークン |
| Environment secret | `CLOUDFLARE_ACCOUNT_ID` | 対象CloudflareアカウントID |
| Repository variable | `CLOUDFLARE_PAGES_PROJECT` | 作成した専用Pagesプロジェクト名 |
| Repository variable | `BETA_ORIGIN` | 正式な `https://PROJECT.pages.dev`。末尾スラッシュ・パスなし |
| Repository variable | `BETA_GOOGLE_CLIENT_ID` | 次項で確認したGoogleの公開WebクライアントID |

APIトークンは今回の静的配信以外に使わず、不要になったら失効させます。
Googleクライアントシークレット・アクセストークンは登録不要です。

## 3. Google Auth Platform

[プロジェクトSakefolioのクライアント](https://console.cloud.google.com/auth/clients?project=sakefolio)を開きます。
2026-11-03の読取り確認で `Sakefolio Web` と `Sakefolio Beta Org Pages` の2つがありました。
後者の承認済みJavaScript生成元は `https://sakefolio-beta-lab.github.io` のみでした。
Cloudflareの生成元はまだ確認できていません。

1. 所有者がBeta用クライアントを選択し、作成したCloudflare正式生成元をAuthorized JavaScript Originsに追加・保存します。プロジェクト名の一字違いやURLパスを入れないでください。
2. そのクライアントの公開IDを `BETA_GOOGLE_CLIENT_ID` に設定します。既存GitHub Pages向けのIDを取り違えないでください。
3. [データアクセス](https://console.cloud.google.com/auth/scopes?project=sakefolio)は、現在 `drive.file` の1件を確認済みです。広い `drive` / `drive.readonly` / `spreadsheets` スコープを追加しません。
4. [対象](https://console.cloud.google.com/auth/audience?project=sakefolio)はExternal / Testing、テストユーザーは所有者1人でした。公開ステータスを変更しません。
5. 受入試験に使う2つ目のアカウントについて、本人・所有者の明示的許可を得てテストユーザーへ追加します。アドレスを推測せず、個人メールはリポジトリへ保存しません。

GIS popup token modelなので、認可コード方式のcallback URIを新しく導入する必要はありません。
保存済み権限の宣言と実際のログイン成功は別です。
Testingの認可は原則7日で失効します。
アクセストークンはより短命で、アプリは再接続を案内します。
ブラウザにrefresh tokenやclient secretを保存しません。

## 4. 配信操作とロールバック

1. PR #7のテストとレビューを確認。ワークフローがdefault branchに入るまでは手動dispatchを利用できないため、レビュー後のマージが必要です。旧PR #3/#4を共有Pagesへマージしません。
2. Actions → Deploy Brother Beta to dedicated Cloudflare Pages → Run workflow。
3. `source_sha` にレビューした完全40桁のコミットSHAを入力。可変のブランチ名は使いません。
4. テストとCodeQLが合格した後、`brother-beta` の承認画面で対象SHA・正式オリジン・静的配信のみであることを確認して所有者が承認します。
5. 自動の `verify:beta` がHTTP CSP、frame-ancestors、nosniff、COOP、no-store、配信JS/CSSハッシュ、manifestのsourceCommitを検証します。これが失敗したら受入試験を開始しません。
6. 検証失敗・重大不具合時はCloudflare Pages → Deployments → 直前の正常なproduction deployment → Rollback。初回で正常版がなければ配信を止め、アプリの利用を保留します。Google Drive/Sheetsを削除して戻そうとしないでください。
7. トークン流出が疑われる場合、該当利用者がGoogleアカウントのサードパーティ接続からSakefolioの権限を解除します。既存のGoogleアカウントデータの一括削除は行いません。

`_headers` はCloudflare配信で適用されます。
ViteのpreviewやGitHub Pagesでこのファイルが存在するだけではHTTPヘッダー検証合格になりません。
Betaビルドは正式オリジン以外からのGoogle接続を拒否します。
プレビューURLをOAuth許可リストへ無制限に追加しないでください。

## 5. 月額0円の条件と中国本土

Cloudflare静的配信は無料・リクエスト無制限、Freeのビルド枠は月500回。
Functionsや有料Workersを使いません。
Drive APIの標準利用は追加料金なしですが、2026年後半の超過課金について公式文書が予告しており、実プロジェクトのquota/billingは未検証です。
課金契約・割当増加・有料ストレージ購入を自動で行いません。
Google無料ストレージは利用者の他のGoogleサービスと共用です。
容量不足時は安全にエラーにし、勝手に有料契約しません。

中国本土の実ネットワーク試験は未実施です。
Google Identity / Drive / Sheetsに依存する日本酒クラウド版を、中国本土から利用可能と判定できません。
Cloudflareへの到達だけではGoogle認証・保存の利用可能性を証明しません。
現地で各接続先を検証し、失敗する場合は現行Brother Betaの対象外です。
代替案は日本国内での利用、または写真・日本酒記録のローカル保存と手動バックアップを別途設計することです。
既存の中国酒ローカル機能は日本酒クラウド版の代替実装ではありません。

公式資料（2026-11-03確認）:

- https://developers.cloudflare.com/pages/platform/limits/
- https://developers.cloudflare.com/pages/functions/pricing/
- https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
- https://developers.cloudflare.com/pages/configuration/headers/
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/workspace/drive/api/guides/limits
- https://support.google.com/cloud/answer/15549945?hl=en
