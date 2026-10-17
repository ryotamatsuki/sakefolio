# Sakefolio React Web — 個人の Google Drive を利用

既存AppSheetは変更しない。React + TypeScript + Viteで独自デザインを実装。専用サーバーや独自データベース不要。Google OAuthのdrive.fileスコープだけを要求し、利用者本人のGoogle SheetsとGoogle Driveに直接保存します。

公開テスト版では本人Googleアカウントで新規保存・写真再表示・再認証をChromeで確認済み。iPhone Safari実機・異なるGoogleアカウントの分離・包括的セキュリティ試験は未完了です。mainへのマージはしていません。

## 無料で起動する

1. https://console.cloud.google.com/ からGoogle Cloudプロジェクトを新規作成。
2. Google Drive API / Google Sheets APIを有効化する。
3. Google Auth PlatformのAudienceでExternal / Testingを選択し、自分と兄のGmailアドレスをTest usersへ追加。
4. Data accessに https://www.googleapis.com/auth/drive.file だけを登録。Drive全体・Sheets全体の権限は不要。
5. OAuth Client IDの種類にWeb applicationを選択。Authorized JavaScript originsに http://localhost:5173 と https://ryotamatsuki.github.io を登録。GIS token modelのためredirect URIは不要。
6. ローカル試験はwebディレクトリへ移動し、.env.exampleを.envにコピーして、VITE_GOOGLE_CLIENT_IDをOAuth Client IDに変更。次に npm install、npm run dev を実行して http://localhost:5173 を開く。
7. GitHubの https://github.com/ryotamatsuki/sakefolio/settings/variables/actions でRepository variable VITE_GOOGLE_CLIENT_ID にOAuth Client IDを登録。これは公開されるクライアントIDであってsecretではありません。**Client secretをコードに入れないこと。**
8. ブランチをレビューしてmainへマージ後、Settings > PagesでSource=GitHub Actionsを選択。Actionsの「Sakefolio React build」でビルド・デプロイが成功したことを確認してから https://ryotamatsuki.github.io/sakefolio/ を開く。

注: Github PagesはWebページや共通の公開銘柄データを誰でも取得できます。認可されたGoogleアカウントだけが個人データへアクセスする構成です。Google OAuth Testingの認可期限やテストユーザー制限があり、本格公開時に設定・表示義務・同意画面などの確認が必要です。

## 保存するファイル（本人のGoogle Drive）

Sakefolio フォルダ内にSakefolio_DataというGoogleスプレッドシートとPhotosフォルダを自動作成します。
スプレッドシートにはBrands（手動銘柄）、Bottles（個別商品）、Reviews（飲酒記録）、Photos（紐付け）、Tags（将来用）、Wishlist（将来用）の6タブを作成。初回以外は既存のSakefolio_Dataを再利用します。

公開の3,303銘柄は public/sakenowa-brands.json を全ユーザーが参照します。さけのわ（https://sakenowa.com）の公開データのうち公式銘柄だけを抜き出しました。各利用者の手入力銘柄や記録・画像を公開リポジトリへ含めていません。

既存AppSheetデータのGoogle Sheetsを上書きしたり共有したりしません。AppSheetの相対画像パスと新しいDriveファイルIDは異なります。既存個人データの移行にはGoogle Pickerによる明示的選択や画像ファイルの移行処理が必要で、今は未実装です。

## 日本酒の正しい分類

酒蔵→銘柄→個別商品（名前・限定名）→飲酒記録の階層を使用します。

- 特定名称：純米酒、特別純米酒、純米吟醸酒、純米大吟醸酒、吟醸酒、大吟醸酒、本醸造酒、特別本醸造酒の8種類。これに普通酒、表示なし・不明、その他（自由記入）を加えます。
- 火入れ区分：生酒、生貯蔵酒、生詰酒、火入れ、不明を単一選択。無濾過・原酒と混同しません。
- 酒母・造り：速醸、生酛、山廃、その他、不明を選択。
- 製法・特徴：無濾過、原酒、にごり、直汲み、斗瓶囲い、熟成、スパークリングなどを複数選択。
- 商品・限定名：既定の分類とは別の自由入力。原料米・精米歩合・アルコール度数・製造年度は任意。
- 酒蔵所在地：都道府県、市町村、住所（任意）。酒の実際の製造場所、原料米の産地と同一であるとは推定しません。
- 飲酒記録：日付、5段階評価、感想、写真を保存。繰り返し飲んだ際は独立した記録を残します。

特定名称の要件は原材料や製法にも依存し、精米歩合だけでは判定できません。詳細: 国税庁 https://www.nta.go.jp/taxes/sake/hyoji/kijun/gaiyo/04.htm

## 酒蔵のGoogleマップ連携

酒蔵名と所在地から https://www.google.com/maps/search/?api=1&query=... を生成。公式Maps URLsのためMaps APIキー不要。検索結果で候補を表示する方式で、緯度経度の確定・ジオコーディングや正しい酒蔵にピンが立つことを保証する機能ではありません。
出典 https://developers.google.com/maps/documentation/urls/get-started

## セキュリティ・制約

- Googleのdrive.fileのみを要求します。利用者が個別に許可したファイルとアプリで作成したファイルなどにアクセスできます。
- Googleアクセストークンはブラウザメモリ（React state）だけ。localStorage、サーバー、GitHubには保存しません。期限切れ時は再認可が必要です。
- 画像は本人のDriveに非公開保存。写真表示はアクセストークンを付けたAPIレスポンスから生成し、共有公開URLは作りません。
- 新しいレビューの記録はSheetsとDriveへの複数API書き込みなので、障害時のトランザクション・ロールバックはまだありません。孤立した商品・写真が残ることがあります。
- 写真は1件1枚（最大10MB）。編集・削除・オフライン利用、共有・SNS・AI認識、醸造所建物の実測位置の保証、AppSheetデータ移行は未実装。
- アプリ実行時のXSSや依存ライブラリの脆弱性対策と、Google API/保存容量の制限管理が別途必要。

## 受入テスト（すべて未実施）

- [ ] npm run build成功
- [ ] 自分のGmailで初回フォルダ・6タブ生成 / 再認可して再利用
- [ ] 公式銘柄・手動銘柄それぞれで酒蔵・商品・レビューを保存
- [ ] 純米吟醸酒・生酒・無濾過・原酒を別軸で保存
- [ ] 都道府県・市町村保存 / Googleマップ検索
- [ ] 写真を本人のDriveへ保存しギャラリーで再表示
- [ ] iPhoneで撮影・保存・再読込
- [ ] 兄のGoogleアカウントでは自分のデータが見えず、兄のDriveに独立して保存される

## SAKEOpenData との酒蔵住所結合
- `public/brewery-addresses.json` は Code for SAKE の SAKEOpenData `json/breweries.json` を元に、さけのわ蔵元名・都道府県に**完全一致**した酒蔵だけを抽出した参考住所です。異なる所在地情報が衝突した蔵元は対象外としています。
- 元データ: https://github.com/Code-for-SAKE/SAKEOpenData/blob/master/json/breweries.json
- ライセンス: MIT License, Copyright (c) 2020 Code for SAKE （同梱 `web/public/SAKEOpenData-LICENSE.txt`）。
- 住所は更新日時・所在地変更・製造所と会社所在地の差のため正確性を保証しません。緯度経度は未収録であり、**地図に正確なピンを置けると解釈しない**でください。現段階ではGoogleマップでの検索・確認を可能にします。
- 既存の個人登録住所は上書きしません。未一致の酒蔵も手入力できます。旧AppSheetデータは対象外です。

## 酒蔵の代表点ジオコーディング（2026-10-16）
- さけのわ銘柄マスターの1,305酒蔵（蔵元名+都道府県で集計）とSAKEOpenDataの住所を完全一致で結合し、住所が一意な975蔵元を対象にしました。
- デジタル庁アドレス・ベース・レジストリを元とする **Geolonia Japanese Addresses v2** と `@geolonia/normalize-japanese-addresses` を使用し、一括ジオコーディングを実行しました。
- 結果: **地番・住居表示の代表点 384件、町丁目代表点 513件、未解決78件**。有効座標は計897件です。町丁目代表点は**酒蔵の正確な位置ではありません**。
- 成果: `public/brewery-coordinates.json` は `lat, lon, precision, source, address, breweryName, prefecture` を持ちます。監査結果 `data/brewery-geocoding-report.json` に全975件の変換状態・不一致・取得エラー等を記録。
- `precision=lot_or_address` は住居表示フロンテージまたは地番の代表点であり、酒蔵建物・入口・仕込み場の位置を実地確認したものではありません。`precision=town_approximate` は町丁目内の参考位置です。ピン表示時は精度を区別してください。
- 酒蔵名の変更、所在地移転、SAKEOpenDataに記載された本社住所と製造所の不一致、表記揺れ・住所古さは未検証です。
- パイプライン: `scripts/geocode-breweries.mjs`, `.github/workflows/sakefolio-geocode.yml`。`public/brewery-addresses.json` から再生成可能です。
- データ出典: [SAKEOpenData](https://github.com/Code-for-SAKE/SAKEOpenData) (MIT), [Geolonia 住所データ v2](https://github.com/geolonia/japanese-addresses-v2) (CC BY 4.0, 元データ: デジタル庁「アドレス・ベース・レジストリ」)。Googleマップから座標を抽出・スクレイピングしていません。
- 未解決の酒蔵について、実際の建物位置が検証できる公的施設情報や蔵元の住所確認を追加することで精度をさらに高められます。公開Jageocoderデモへの大量リクエストは行いません。


## Sakefolio 私の日本酒地図（2026-10-17）
- テストブランチ `test/sakefolio-pages-preview` の「私の日本酒地図」に、ログイン中の利用者自身が記録した酒蔵の位置だけを地図表示します。個人データはGoogle Sheets/Driveから読み取り、地図タイルへ飲酒記録・写真・評価を送信しません。
- 地図で酒蔵を選択すると、その蔵の飲酒履歴とラベル写真・評価・感想を表示します。住所検索、Googleマップでの道案内、既存酒蔵の再記録への導線も備えます。
- `brewery-coordinates.json` の座標（当初897件）を酒蔵名＋都道府県で厳格に照合。重複、範囲外、精度不明の座標はピン化せず、住所検索へフォールバックします。
- 位置精度は施設資料照合、地番・住居表示代表点、町丁目参考位置の3段階を明示。後二者は醸造所建物・入口の正確な位置ではなく、町丁目座標は参考位置として破線マーカー表示。
- 背景地図はOpenStreetMap標準タイルで、表示領域に必要なタイルだけをブラウザが取得します。© OpenStreetMap contributorsの帰属表示を地図上に常時配置。位置精度は取得元の品質に依存します。
- Google Mapsへの外部リンクは場所をユーザーが確認するためのものです。Google Mapsから座標を取得・再配布する機能ではありません。
- 今回の機能は酒蔵に紐づく**飲酒記録の地図**です。訪問履歴や飲んだ店の場所の記録とは区別してください。
- 単体テスト: `src/breweryMapModel.test.mjs`（自分の記録のみ、同名酒蔵の区別、重複座標の除外、精度表示、地図投影）。

## 中国酒・海外酒類の試験実装（開発ブランチのみ、2026-10-17）

**ブランチ:** `feat/china-beverages-local-first`。日本酒テスト版 `test/sakefolio-pages-preview` と `main` は変更しません。専用 `sakefolio-china-ci.yml` はビルド・テスト専用で、GitHub Pagesへデプロイしません。

### 対応範囲
- 「中国のお酒」から **白酒（Baijiu）・黄酒（紹興酒を含む）・中国ビール・中国ワイン** の各入力フォームを使用可能。
- 香型、糖度・熟成、ビアスタイル、ブドウ品種・ヴィンテージなどを酒類別に表示。商品名やABV、ヴィンテージを自動生成しません。
- 手作業で確認した中国酒の主要 **ブランド名16件** を検索候補に収録。ブランド候補はSKUカタログではありません。商品名・原料・年数などはラベルや公式資料で確認してから記録してください。
- Open Food Factsの検索は明示的に検索ボタンを押した場合のみ `GET /cgi/search.pl` を呼びます。検索語のみ外部送信。検索結果には商品名、ブランド、容量、バーコード、出典リンクを表示。**日本酒の3,303件や個人の記録は送信しません**。API制限10検索/分/IPを尊重し、15秒間隔で実行。商品区分の誤り・欠測、CORS・中国本土からの到達不可に備えて手動登録が常に使用できます。
- Open Food Factsデータベースは **ODbL**、画像は一般に **CC BY-SA** ですが、ラベルの知財権などは別問題です。**画像は自動で複製しません**。ユーザーが権利上使用可能な写真を自分で選択した場合のみ端末内に保存します。出典は各記録にHTTPS URLとして保持できます。
- 記録と写真はこのブラウザの **IndexedDB** に保存し、日本酒のGoogle Sheets/Driveとは別管理です。カテゴリーごとの件数・平均評価と個別記録閲覧あり。
- 明示的な区別：`catalogued`（商品情報だけ、飲酒日・評価なし）と `tasted`（実際に飲んだ、飲酒日必須・評価任意）。ユーザーが飲んでいない評価を推測しません。
- JSONバックアップは写真もbase64で含み、インポート時に形式・写真バイト列を検証し、重複IDを上書きせずに追加します。長期保管や他の端末への移動はファイルの安全な持ち運びが必要です。

### 重要な制限・次の段階
- **Google Driveへの中国酒記録・写真の自動同期は未実装**です。既存の日本酒Sheetsスキーマを変更・破壊しないため、まず隔離した保存方式としています。
- IndexedDBはブラウザのストレージ削除・端末故障・プライベートブラウズ等で消える場合があります。ブラウザ・端末にアクセスできる人には記録が閲覧され得ます（暗号化保存ではありません）。バックアップの定期的な書き出しを推奨します。エクスポートしたJSONにも個人メモ・写真が含まれます。
- **中国本土でのGitHub Pagesの可用性は未検証**。Googleのスクリプトが失敗してもページ全体が利用できるよう設計していますが、実機アクセス検証および中国本土向けの代替ホスティングは未実装。
- **Wikidataの大量データは未取り込み**。WikidataはCC0のメーカー・地域マスター拡張候補ですが、今回の16件はWikidataの一括取得で検証された結果ではなく手動選定候補です。中国酒の全市場に対する網羅率も不明です。
- **酒蔵地図・日本酒の嗜好分析との統合は未実装**。国際酒類を混入すると味の4軸が不適切になるため、酒類別分析を拡張するまで分けます。国際酒類は外部OpenStreetMap検索リンクのみ（施設座標は未照合）。
- 日本酒の新規登録や個人Googleデータ、公開テスト版の挙動は変えない方針です。
- 受入確認：`npm ci && npm run test:security && npm run build`。iOS Safari、中国本土ブラウザでの実操作、OAuthとIndexedDBの併用、写真付き復元、Open Food Factsの実通信については別途E2E検証が必要です。

参照：
- https://openfoodfacts.github.io/openfoodfacts-server/api/
- https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/
- https://www.wikidata.org/wiki/Help:Data_access

### Wikidataの任意検索（追加）
- 「Wikidataでブランド・メーカーを照合」は `wbsearchentities` を中国語で検索する任意機能です。キーワードだけをWikidataに送信し、企業以外の同名項目も結果に混入するため、候補の説明・Q-IDをユーザーが確認します。Wikidataで確認された商品スペックや工場座標を自動補完する機能ではありません。CC0: https://www.wikidata.org/wiki/Wikidata:Licensing

## 2026-10-17: 中国酒拡張 Stage 2–4（隔離ブランチ限定）
- Wikidata CC0の自動マスター `web/public/china-wikidata-master.json`: `web/scripts/build-china-wikidata-master.mjs` がWDQSで白酒・黄酒・ビール・ワインの固有商品とメーカーを抽出し、失敗しやすい広域クエリの代替としてMediaWikiの検索＋実体属性（P31/P279/P17/P495/P176）照合を行う。**検索にヒットしただけでは商品として採用しない**。各行にWikidata Q-IDと直接リンクを保存。監査 `web/data/china-wikidata-master-audit.json` にクエリ件数・タイムアウト・分類別件数を明記。商品エンティティ数はWikidataの収録範囲に左右され、一般の酒類SKUを網羅するものではない。
- オープンデータ間のライセンスは分離: WikidataデータはCC0。Open Food FactsのODbL商品データは同一静的マスターへ結合せず、明示的な検索時だけ取得。個人記録は外部マスターに含めない。
- 中国メーカー地図: `InternationalProducerMap.tsx` は、製造者自身のWikidata P625座標だけをピン化し、町の代表点・中国行政区の代表点は使用しない。Wikidataのメーカー・企業エンティティ座標は**実際の製造所の建物位置を保証しない**。写真・メモ・評価をタイルサーバーへ送らない。個人の記録との紐付けは名前の曖昧一致ではなく、記録時に選んだ `producerQid` の厳密一致。未照合記録は別リストへ表示。
- 酒類別嗜好分析: `InternationalInsights.tsx`、`internationalAnalytics.ts`。酒類混合平均を廃止し、白酒=香型、黄酒=区分・糖度、ビール=スタイル・苦味・ボディ、ワイン=種類・ブドウ品種・ボディなどを別々に集計。各分布・項目をタップすると該当記録へ移動。嗜好コメントは**同じ酒類内の各グループの評価3件以上および対照群3件以上、差0.35点以上**の場合のみ生成。未飲酒の登録は評価・嗜好推定の母集団から除外。自由入力の香り・味わいは完全一致の記述タグのみを集計。
- CI: `.github/workflows/sakefolio-china-master.yml` は**feat/china-beverages-local-firstだけ**の更新を許可し、`main`および現在のGitHub Pages公開版は不変更。`sakefolio-china-ci.yml`は検証専用でデプロイなし。

制約：Wikidataの座標は本社・会社を示す可能性があり現地確認の工場ピンではない。酒類別のサンプルが不足する場合は分析コメントを作らない。OpenStreetMapタイル・WDQS・Open Food Facts・Wikidataの中国本土からの到達性は未検証。ユーザーの中国酒は引き続きブラウザ内IndexedDBにのみ保存される。

### 中国の醸造・蒸留施設（OpenStreetMap ODbL）
- `web/scripts/build-china-osm-facilities.mjs` はOverpass APIを用い、**ISO3166-1=CNの行政エリア内**で `craft=brewery/winery/distillery` または `industrial=...` の付いた**名前のある施設**を抽出します。店舗の `brewery=*` タグを製造所と誤認しません。
- OSMのノード点と建物・領域の**中心点（入口ではない）**を区別。各結果は個別OSMオブジェクトURLを付与。酒類不明の `distillery` を白酒製造所と自動分類しません。
- 静的 `web/public/china-osm-facilities.json` と取得監査 `web/data/china-osm-facility-report.json` をWikidataのCC0マスターとは別々に保存。OSMのデータはODbLで© OpenStreetMap contributors。
- `InternationalProducerMap.tsx` では出典別の表示と、OSM IDを手動で選択した記録に限る厳密な紐付けができます。地図に表示しても製造所の稼働状況・実際の製造品種・測地精度を保証しません。
- Overpassの利用規定・公共サーバー負荷に配慮し、手動または専用ワークフローでの再生成に限ります。取得失敗時には推測点で補完しません。

### 容器容量・アルコール度数の標準化（2026-10-17）
- 中国酒の登録フォームの容量（1容器あたりmL）・ABV（% vol）は酒類別の定番値の選択を基本にし、非標準のサイズ／度数のみ「その他」で数値を入力。容量 **1〜20000mLの整数**、ABV **0〜100%・小数第1位まで**を保存時にも検証します。空欄は不明として保持し、ゼロと混同しません。
- Open Food Factsの単品容量を `330ml`、`33cl`、`0.75l`、`500毫升` などから **mLに正規化して自動セット**。複数容器セット、単位が不明な商品は自動入力せず、誤登録を避けます。アルコール度数は根拠のない推測をしません。
- ビールのスタイル・苦味・ボディ、およびワインのボディなど集計軸になる分類を選択式に変更。ワインのヴィンテージは **西暦1900年以降〜翌年**の数字に制限。非定型の自由記述は、香りや原料・品種等、商品によって自由度が必要な項目に残します。
- Sheetsの`ChinaDrinks.attributesJson`のJSONキー`volume`、`abv`は従来通りで、列追加・旧データ書き換えなし。新規データは数値表記を正規化して保存します。旧データについても数値に変換できるものは集計時に正規化し、変換できないものは集計分母から除外します。
- 中国酒の酒類別嗜好分析に、容量別件数・度数別件数・平均度数・最頻容量を追加。集計単位は**登録件数ベース**（同一SKUを繰り返し記録した場合は重複カウント）であり、固有商品の市場構成を示すものではありません。UXTESTの仮評価は引き続き本人の嗜好と区別します。
- 主な回帰条件：`33cl→330mL`、`0.75L→750mL`、`6×330ml→自動入力なし`、ABV`5.0→5`、`5.55→入力拒否`、容量`330.5→入力拒否`。入力制限はUIだけでなく`validateInternationalRecord`でも必須とします。
