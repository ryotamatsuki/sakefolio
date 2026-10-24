# Sakefolio PR #3 — 身内1人の限定ベータ前P0検証

検証日: 2026-10-24 JST。対象: PR #3 / `security/sakefolio-audit-2026`。
環境: Windows、接続済みChrome、Node 22.17.0/npm 10.9.2、GitHub Actions Node 24。
実Google利用者は所有者1人。今回の障害注入はモックで実施し、既存Googleデータは変更していない。

## A. Executive Summary

**判定: CONDITIONAL GO — OWNER ACTION REQUIRED**。
お兄さんへの利用開始案内は保留。Google Cloudのスコープ宣言、お兄さんのテストユーザー登録、共有オリジンの確認が必要。最終配信版での本人認証と新規保存は下記の実Google追試で成功した。
一般公開の承認ではなく、PRをマージする操作も実施しない。

完了した修正:

- 写真診断が `Reviews` / `Photos` に加えて `ChinaDrinks.photoId` も参照し、正常な中国酒写真を孤立扱いしないよう修正。
- ファイルごとの参照レコード集合と `appProperties.reviewId` を照合。不正ID、欠損、複数レコードからの矛盾、未知の中国酒ヘッダーを正常扱いしない。診断は読取りのみで、自動削除しない。
- 日本酒の保存中ログアウトで、権限取消しコールバックが未完了保存の注意表示を消していた問題を修正。
- CodeQLの実SARIFに対するHigh/Critical拒否ゲートを追加。解析成功だけを重大問題0件の証明にしない。
- ゲートで検出されたHigh4件を修正し、境界値の回帰テストを追加。

残留リスク:

- Google API間にトランザクションはなく、ログアウトは受理済み書込みを取り消さない。再試行前に安定IDで実体を照合する。
- 写真アップロード後の中断は一時的な未参照写真を残し得る。診断と同一操作の再試行で確認し、自動削除は行わない。
- ページを閉じる等で写真そのものの未送信バイトが失われる場合、再選択が必要。永続ジャーナルは認証トークンや写真内容を保存しない。
- GitHub Pagesは同一オリジンを他アプリと共有する。パス分離はセキュリティ境界ではなく、全兄弟アプリの監査は未完了。

## B. テスト結果一覧

| ID | テスト | 結果 | 実行証拠 | 残課題 |
|---|---|---|---|---|
| A | OAuth設定 | BLOCKED — OWNER ACTION REQUIRED | Chromeで同一クライアント、External/Testing、1テストユーザー、Drive/Sheets API有効を確認 | Data Access全区分0件。drive.file宣言と兄の追加が必要 |
| B1 | 書込み前通信切断 | PASS（モック） | google.test / internationalCloud.test / App.test / InternationalDrinks.test | 最新版での実Chrome通信断を行ったとは主張しない |
| B2 | 書込み成功後の応答消失 | PASS（モック） | 書込み後に応答だけ拒否し、再試行後1記録/1写真、参照一致をassert | 実Google応答消失を再現した結果ではない |
| B3 | 保存中ログアウト | PASS（モック） | AbortSignal、後続API停止、再接続後の旧応答無視、未完了通知をassert | Google受理済み処理は取消不可 |
| C1 | 日本酒写真 | PASS（モック） | 正常参照で孤立0 | 実データの最新版診断は別判定 |
| C2 | 中国酒写真 | PASS（モック） | ChinaDrinksだけが持つ正常参照で孤立0 | 同上 |
| C3 | 真の孤立 | PASS（モック） | 未参照ファイルだけを検出 | 自動削除なし |
| C4 | ID不正・欠損 | PASS（モック） | 不正参照数/欠損数を検出 | なし |
| C5 | 複数参照 | PASS（モック） | 同一所有者は重複計数せず、矛盾する所有者は不一致検出 | なし |
| C6 | 過去の合成データの誤報 | PASS（実Google＋fixture） | 最新配信で日本酒5/中国酒5/写真3、孤立・appProperties不一致等すべて0 | 診断は読取りのみ |
| D | 回帰・CI・CodeQL | PASS（code SHA 3f297113） | 本文Fに実行URL | Medium2件は範囲・到達可能性を評価して残す |
| E | 実URL・オリジン | PASS（実URL/認証/保存/更新後再読取り）・BLOCKED（共有オリジン全体） | 追試で各6件、既存中国酒写真読込み成功、warn/error0 | 全兄弟アプリ/登録済みSWの確認は残る |
| UAT-1 | お兄さんのアカウント分離 | NOT RUN | ユーザー指示に従い受入試験へ移管 | 本人のアカウントのみ使用 |
| UAT-2 | スマートフォン実機 | NOT RUN | 同上 | 所有者アカウントを兄の端末へ登録しない |

### 過去の実Google試験との区別

2026-10-22、securitySource `4b0ff36` のサンドボックスで、日本酒 `UXTEST-20261022-JP-RETEST`、中国酒 `UXTEST-20261022-CN-RETEST` の保存・再表示と各1行を照合した。
合成EXIF JPEGはPNGとして保存され、eXIf/text等のメタデータはなく、写真はPhotos配下・非共有・所有者のみであった。アプリ側のappProperties検証は成功したが、接続ツールのメタデータ表示ではappProperties自体が省略されたため、直接表示での証明とはしない。
2タブのログアウト同期は約2.5秒、Google側権限取消し後の新規診断読取りは `2026-10-22T14:43:55.136Z` に開始し、認可失効表示とセッション解除を確認した。HTTPステータス生値は保存していない。
これらは過去版のPASSであり、今回修正版の実ブラウザPASSには繰り上げない。既存の証拠ファイルは削除しない。

## C. 不具合修正の詳細

### 中国酒写真の誤診断

以前は日本酒の写真行だけを主な参照元とし、ChinaDrinksの16列目（0起算）の写真IDを参照集合に含めなかった。
修正版はシート一覧をGETし、存在するChinaDrinksのヘッダーを検査してから読み取る。既存の日本酒参照と統合し、参照レコードID集合・Drive実体・親フォルダ・共有・appPropertiesのアプリ識別子/種別/reviewIdを照合する。
単なる警告抑制ではなく、未参照と所有者矛盾を分ける。書込み・移動・削除はしない。

### 保存中ログアウトの通知

Appの権限取消し完了コールバックがステータス全文を上書きし、保存未完了の注意を隠していた。
取消し結果に未完了保存の注意を付加するよう変更。実AppコンポーネントをReact test rendererで動かし、ログアウト後の注意表示と再接続後の遅延完了無視を検証した。ブラウザ実機テストとは区別する。

### CodeQLと監査スクリプト

SARIFではルールがdriverだけでなくextensions側に置かれる。最初のゲートはその形式を解釈できず安全側に失敗したため、参照先コンポーネント・ルールID/indexを解決し、不明・曖昧な結果は失敗させるよう修正した。
その後、High4件（HTML閉じタグ、Drive検索文字列のバックスラッシュ、OAuth識別子の非完全一致、OpenStreetMapのホスト部分一致）が実際に検出された。検出を抑制せず実装を修正した。
HTML抽出はブラウザが受理する属性付き閉じタグにも対応するが、これは監査用のテキスト抽出であり、HTMLを安全にレンダリングするサニタイザとして使用しない。

## D. 保存整合性試験

ネットワーク境界をモック化し、アプリの実保存関数・セッションガード・UIコンポーネントを実行した。写真のエンコード処理は合成画像/制御canvasで行う。記録件数にはシートヘッダーを含めない。

| 経路/障害 | 注入位置 | 初期 記録/写真 | 障害認識時 | 再試行後 | 参照/UI assertion |
|---|---|---|---|---|---|
| 日本酒 B1 | 最初の変更要求前にfetch拒否 | 0/0 | 0/0 | 1/1 | 同じreviewId/予約写真ID、成功表示なし、入力保持→成功 |
| 日本酒 B2 | Reviews等への反映後に応答だけ拒否 | 0/0 | 1/1（UIモックの完了点） | 1/1 | 部分反映テストでも既存行照合、写真IDと記録ID一致 |
| 日本酒 B3 | Bottles反映後に応答保留→abort | 0/0 | review0/写真0（Bottles1） | review1/写真1（Bottles1） | abort後に次の写真/Reviews書込みなし。UIは別の保存完了保留でも旧応答無視 |
| 中国酒 B1 | 最初のPOST/PUT前に拒否 | 0/0 | 0/0 | 1/1 | photoIdがDrive実体を指す、upload1回 |
| 中国酒 追加 | アップロード後、append前に拒否 | 0/0 | 0/1 | 1/1 | 一時未参照写真を同じIDで再利用、append試行2回 |
| 中国酒 B2 | append反映後に応答だけ拒否 | 0/0 | 1/1 | 1/1 | 重複appendなし、photoId/appProperties.reviewId一致 |
| 中国酒 B3 | append反映・応答保留→abort→遅延完了 | 0/0 | 1/1 | 1/1 | AbortError、後続API停止、再接続後旧UI更新なし |
| 中国酒 timeout | append反映前にTimeoutError | 0/0 | 0/1 | 1/1 | タイムアウト表示、同じ写真で復旧 |
| 中国酒 upload-lost | Drive作成済み、応答だけ拒否 | 0/0 | 0/1 | 1/1 | メタデータ/親/MIME/画像バイトを検査して再利用 |

中国酒の上記6障害は通常/サンドボックスの両名前空間で実行した。日本酒も既存の部分書込み・タイムアウト・再読取り失敗テストを維持。
UIのbefore/afterでは失敗時の「入力内容を保持」と成功メッセージ不在をassertし、再試行後に成功表示をassertする。
ジャーナルの既存試験ではメモリIndexedDBへの書込み/再読取り、操作ID保持、異なる未確定保存の拒否、機密情報を保存しないことを確認。実ブラウザ再読込み試験の代替証明とはしない。実Chromeの更新中にGoogleへ書き込む試験は今回NOT RUN。

回復手順: 同じ記録の入力を保持して再接続し、再試行する。再読込み時の未完了警告を無視して別の新規記録を作らない。写真が保持されていなければ同じ合成写真を再選択する。診断で孤立/欠損/矛盾が残る場合は追加保存を止め、記録とDrive実体を読取りで照合する。

## E. Google Cloud設定

### 実画面で確認済み（Chrome、2026-10-24）

- project `sakefolio` / 表示名Sakefolio。
- 配信bundleの公開OAuthクライアントIDとConsoleのクライアントが一致（末尾 `…tnb66321i9fbqf5mk.apps.googleusercontent.com`）。クライアントIDは秘密ではない。シークレットは表示・取得しない。
- Data Accessの非機密/機密/制限付きスコープはいずれも0件。
- AudienceはExternal、Testing、テストユーザー1人（所有者）。個人メールは記録しない。兄の追加は未実施。
- Authorized JavaScript origins: `http://localhost:5173`、`https://ryotamatsuki.github.io`。
- redirect URI登録なし。GISのpopup token modelではサーバーの認可コードcallbackを利用しないため、未登録自体を不具合としない。
- Google Drive API / Google Sheets APIが有効なAPI一覧に存在。
- アプリの要求スコープは `https://www.googleapis.com/auth/drive.file` のみ。過去に所有者が同意画面でも同範囲を確認し、実Drive/Sheetsアクセス成功を確認済み。

**解釈:** Data Accessの宣言と、実行時の要求/実際のgrantは別である。0件表示は広い権限が付与された証拠でも、Drive権限が無い証拠でもない。実装の要求は最小範囲だが、Cloud上の宣言を一致させる作業が残る。

### 所有者が行う操作

1. Google Cloud Consoleでproject `sakefolio` を選択し、Google Auth Platform → Clientsで配信アプリと同一クライアントであることを再確認。
2. Data Access → Add or remove scopesを開く。検索または手動入力で **`https://www.googleapis.com/auth/drive.file` だけ**を選択し、更新/保存。`drive`、`drive.readonly`、`spreadsheets`などの追加権限は選ばない。
3. 再表示でdrive.fileの宣言1件を確認。Testingを維持し、Productionへの切替は行わない。
4. Audience → Test usersに、お兄さん本人から直接確認したアドレスを所有者が追加。チャット/PRにメールや認証情報を貼らない。
5. 修正版サンドボックスで所有者本人がGoogleログイン・必要な同意のみ操作。保存先が `SAKEFOLIO_SECURITY_TEST_20261019` であることを確認し、既存合成データの診断と一意名の新規日本酒/中国酒の保存・再表示を実行。C6とEのBLOCKEDを解除する証拠を残す。

Testingの認可は原則7日で失効する（基本プロフィールのみの例外にdrive.fileは該当しない）。access token自体も短命なので、期限切れ時はユーザー操作で再認可する。本アプリはrefresh token/クライアントシークレットをブラウザ保存しない。

公式資料（確認日2026-10-24）:

- [OAuth公開ステータス・Testing](https://support.google.com/cloud/answer/15549945?hl=en)
- [GIS token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Driveのスコープ宣言とdrive.file](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

### 配信と共有オリジン

共有候補は修正版サンドボックス `https://ryotamatsuki.github.io/sakefolio/security-test-20261019/`。公開ルート `/sakefolio/` は基準版13a7a709を維持し、修正版と誤認させない。
調査時点の古いsandbox manifestはsource35b3a520/securitySource4b0ff36で、修正前だった。配信後の照合結果はFに追記する。
公開root JavaScript SHA256は `7b2331c84f6c84378336861c5286596298044822bc59ed81f5e24977e5157aea`、古いsandboxは `a331226d4ff3e69911889cbabfa92660a30ca289726243dc0277f096e53cda38`。
両者HTTPS200、同じ公開client ID、アプリbundleにService Worker登録は見つからず。HTTP CSPヘッダーはなく、HTMLのCSP metaはHTTPヘッダーの代替証明としない。GitHub Pagesは `_headers` を適用しない。
ルートサイト `ryotamatsuki.github.io` のmainツリー `34d041fe1eb1672a8970a1cbb4e0cd55e209ad95` を対象にindexと4ローカルJSを読取り監査。外部JS読込み、SW登録、eval/new Function/document.writeはこの範囲では見つからず、app.jsにはinnerHTMLテンプレートが存在する。リンク先の全兄弟アプリは未監査で、現在ブラウザに登録済みの全SWスコープも未確認。
アプリのトークンはReactメモリに保持し、タブ同期はトークンを含まない。localStorage/sessionStorageにトークンを置かなくても、同一オリジンの侵害から安全であることまでは保証しない。専用オリジンは一般公開前に必要。今回の限定ベータでも共有オリジンの信頼範囲の最終確認は所有者の残作業。

## F. GitHub成果

- Repository: `ryotamatsuki/sakefolio`
- PR: https://github.com/ryotamatsuki/sakefolio/pull/3 （Draft維持・未マージ）
- Branch: `security/sakefolio-audit-2026`
- Runtime/code SHA: `3f297113415f8011c5d984e2e2dbac7955ab1683`
- ローカル: `npm run test:security --prefix web` 145 pass / 0 fail / 0 skip。GitHubのPR版145件、sandbox146件（名前空間の追加試験1件）。既存116件を削除・skipせず保持。
- `npm run build --prefix web`: TypeScript noEmitとVite build成功。lint専用スクリプトは既存packageに存在せず、新規lintを実行済みとはしない。静的解析はTypeScript+CodeQL。
- `npm ci --prefix web` / `npm audit --prefix web --audit-level=high`: 脆弱性0（critical/high/moderate/lowすべて0）。依存追加なし。
- Build: https://github.com/ryotamatsuki/sakefolio/actions/runs/40072406191
- CodeQL: https://github.com/ryotamatsuki/sakefolio/actions/runs/40072406345 （成功。SARIF results 2 / criticalHigh 0、2026-10-24T07:00:54.909Z）
- 変更: `google.ts`、`App.tsx`、保存/UI/診断テスト、監査スクリプト、SARIFゲートとテスト、CodeQL workflow。
- Report: `web/SECURITY-BETA-P0-2026-10-24.md`。

### サンドボックス配信証拠

- Sandbox commit: `d63d992bce8159f7b0124978f80b29e4ee075bf9`。
- [sandbox build / CodeQL / deploy](https://github.com/ryotamatsuki/sakefolio/actions/runs/40072583881): 全ジョブ成功。146 pass / 0 fail、依存脆弱性0、SARIF results2 / criticalHigh0。
- 公開版baselineの9ファイルすべて `sha256sum --check` がOK。公開ブランチは `13a7a709dc8057e6e1142716e69c7906c0d14699` のまま。
- 配信後の公開root JSハッシュは `7b2331c84f6c84378336861c5286596298044822bc59ed81f5e24977e5157aea` で調査前と一致。
- 修正版sandboxのJS: `assets/index-B7KXK4Yv.js`、SHA256 `1e36e3ee78a4ae543b60a84ec575511ac08ffbe7e3bec907703fbdf0fb75fa59`、HTTP200。
- 実配信manifest: sourceCommit `d63d992bce8159f7b0124978f80b29e4ee075bf9` / securitySource `3f297113415f8011c5d984e2e2dbac7955ab1683` / publicSource13a7a709 / driveFolder `SAKEFOLIO_SECURITY_TEST_20261019`。名前空間マーカーも確認。
- Chromeで最新版を表示し、サンドボックス専用バナーと保存先名、非認証ホームの描画を確認。採取範囲でwarn/errorログ0。Googleボタンから認証popupが開き、要求scopeはdrive.file、include_granted_scopes=falseであることを確認。本人認証完了後の診断・保存は別途必要。
- 公開rootは修正版PRを配信していない。兄へ古い公開rootを案内しない。

このレポートを追加する文書コミットは実行コードを変更しない。PR最終headとそのCIはPRコメントへ記録し、runtimeの検証SHAと区別する。

CodeQLで残ったMedium2件はメンテナンスCLIの経路: `audit-official-brewery-sites.mjs` のrepo内対象一覧からのHTTP取得（6.5）と、`build-china-wikidata-master.mjs` のWikidata応答からのローカルJSON報告書書込み（6.3）。ブラウザbundleやGoogle認証経路にimportされない。
前者はHTTP(S)/認証情報/ポート/ローカルIP/DNS/リダイレクト/サイズ/期限を制限するがDNS再解決の残余リスクがあるため信頼済みのrepo内対象一覧だけを使う。後者の出力パスはCLI/既定値でネットワーク値から決まらず、データを正規化しJSONとして保存する。任意コード実行やブラウザHTML実行には使わない。Mediumを0件と記載したり自動クローズせず、範囲と到達可能性を記録して残す。

## G. お兄さんに依頼する最終受入チェック

**所有者がA/C6/Eの残作業を完了し、READY FOR LIMITED BETAへ更新した後に渡す。**

- [ ] 自分のGoogleアカウントでログインし、特定のアプリ使用ファイルだけのDrive権限であることを確認。
- [ ] 所有者の記録が見えないことを確認。見えた場合は保存せず中止して所有者へ連絡。
- [ ] 自分のDriveだけにある検証用保存先へ、一意のテスト名で日本酒/中国酒を各1件保存。
- [ ] 合成または公開して問題ない写真を1枚選び、記録を保存。個人情報や位置情報のある本物の写真は初回試験には使わない。
- [ ] ページ更新後、記録と写真が各1件表示され、重複していないことを確認。
- [ ] 接続解除→再接続で自分の記録だけが見えることを確認。
- [ ] 利用予定のiPhone SafariまたはAndroid Chromeで同じ手順を行う。所有者のGoogleアカウントは端末へ追加しない。
- [ ] 不具合時は試験名、操作、発生時刻、認証情報を含まないエラー文だけを連絡。トークン/認証コード/パスワードを送らない。

UAT-1/2成功後の許容範囲はお兄さん1人のテストデータでの利用のみ。重要データはバックアップし、当面はアカウント切替・複数タブ同時編集を避ける。一般公開やPRマージは別途明示承認が必要。

## 実Google追試 — 2026-10-24 08:16 UTC時点

対象は配信済みsandbox d63d992b / securitySource3f297113。所有者がdrive.fileのみを確認し認証した。同一アカウント・検証保存先だけを使用。

- **PASS C6**: 既存の日本酒5件、中国酒5件、写真情報3件を読取り診断。写真不足、孤立、appProperties不一致、親不一致、共有、共有不明、未完了写真行、写真行不足、不正参照、未紐付け商品がすべて0件。旧版の中国酒写真誤報は実データでも解消した。
- **PASS 新規日本酒保存**: `UXTEST-20261024-JP-P0`、架空蔵`UXTEST-20261024-P0`、評価4、架空メモ、写真なし。成功表示後にホームで当該記録1件と総数6件を確認。
- **PASS 新規中国酒保存**: `UXTEST-20261024-CN-P0`、商品`合成検証・3f297113保存再表示`、UXTEST仮評価、写真なし。マイコレクションに当該記録1件、総数6件を確認。
- **PASS 保存後診断**: 日本酒6件、中国酒6件、写真情報3件、上記全異常項目0件。写真は増やしていない。既存データの変更/削除なし。
- **PASS 更新後の実再読取り**: ページ更新でメモリのセッションが消え、本人が同じアカウントで再認証。日本酒6件と新規JP1件、中国酒6件と新規CN1件を確認。既存中国酒写真`UXTEST-CHINA-CLOUDのラベル`はimg.complete=trueかつnaturalWidth>0。再診断も6/6/3で全異常項目0。採取範囲のwarn/errorログ0。新規写真アップロードやEXIFの再検査とは区別する。

この追試は通常保存と診断の実Google試験であり、B1〜B3の実通信障害試験や、新規写真のアップロード再試験として扱わない。Cloud宣言0件・兄未登録・共有オリジンの残課題は変わらず、総合判定はCONDITIONAL GO — OWNER ACTION REQUIREDを維持。
