# AppSheet エディタ構築手順（MVP v1）

この文書は、実際に AppSheet エディタで設定する値を列挙した**実装仕様**です。GitHubのコードだけではAppSheet本体は生成されません。

## 0. 事前準備

- [Sakefolio の Google Sheets](https://docs.google.com/spreadsheets/d/1cBNEjeYFZMbmumXSckBLrRfQAKqWRzFnofUo6TWyBZs/edit)
- [AppSheet](https://www.appsheet.com/)
- [公式 AppSheet 新規作成ガイド](https://support.google.com/appsheet/answer/11980957?hl=ja)

**コピー配布前の原本には個人レビュー・写真を残さないこと。**
このファイルの `はじめに` と `AppSheet設定` は説明用シート。アプリの Data に登録するのは **Brands / Bottles / Reviews / Photos / Tags の5テーブルだけ**。

## 1. Google Sheets から作成

1. 所有者のGoogleアカウントで AppSheet にサインイン。
2. `Create > App > Start with existing data` を選択。
3. アプリ名を `Sakefolio`、カテゴリを Lifestyle 等に設定。
4. Google Sheets を選択し、前述のSakefolioテンプレートを指定。
5. 自動追加されたテーブルを確認し、`Data > +` から不足する4テーブルを追加。
6. `はじめに` と `AppSheet設定` はアプリのデータテーブルにしない。
7. Google Sheets の見出しに変更を加えた場合は、AppSheet側で列を `Regenerate structure` する。

**重要**：AppSheet データベースに変換して使用するのではなく、Google Sheetsをそのままデータソースとして使う。

## 2. テーブル設定

| テーブル | Key | Label | 更新許可 |
|---|---|---|---|
| Brands | brandId | brandName | Adds / Updates（公式行は編集不可） |
| Bottles | bottleId | productName | Adds / Updates |
| Reviews | reviewId | — | Adds / Updates / Deletes |
| Photos | photoId | caption または photoId | Adds / Updates / Deletes |
| Tags | tagId | tagLabel | Read only |

実際のレビュー表示ラベルは仮想列 `reviewTitle` を Reviews に追加し、
`CONCATENATE([brandId].[brandName], " / ", TEXT([drinkingDate]), " / ★", [rating])`
を `App formula` に、`Label` に指定するとよい（brandId は Ref であること）。

### Brands
- `brandId`: Text、Key、非表示、Initial value = `CONCATENATE("manual-", UNIQUEID())`
- `brandName`: Name または Text、Label、Required = ON
- `breweryName`: Text
- `prefecture`: Enum または Text（MVPではText）
- `breweryId`, `areaId`, `sakenowaBrandId`: Text、任意
- `source`: Enum（`sakenowa` / `manual`）、Initial value = `"manual"`、Editable? = OFF
- `createdAt`: DateTime、Initial value = `NOW()`、Editable? = OFF
- `updatedAt`: DateTime、初期値 `NOW()`、更新自動化はMVP必須ではない

**公式行の編集防止**：入力可能な `brandName`、`breweryName`、`prefecture` 等に `Editable_If: [source]="manual"` を指定する。公式の削除はテーブルで許可しない。
「未登録銘柄を追加」は `Brands_Form` から登録する。

### Bottles
- `bottleId`: Text、Key、Initial value = `UNIQUEID()`
- `brandId`: Ref → `Brands`、Required = ON
- `productName`: Text、Label、Required = ON（例：石鎚 純米吟醸）
- `sakeType`: Enum（純米酒 / 特別純米酒 / 純米吟醸 / 純米大吟醸 / 吟醸 / 大吟醸 / 本醸造 / 普通酒 / その他）
- `processingStyle`: EnumList（生酒 / 生詰 / 生貯蔵 / 無濾過 / 原酒 / にごり / 火入れ / その他）
- `riceVariety`: Text、`polishingRatio` / `alcoholPercent`: Decimal、`vintage`: Text、`notes`: LongText
- `createdAt`: Initial value = `NOW()`

### Reviews
- `reviewId`: Text、Key、Initial value = `UNIQUEID()`
- `brandId`: Ref → Brands、Required = ON
- `bottleId`: Ref → Bottles、Required = OFF、Valid_If:

  `SELECT(Bottles[bottleId], [brandId] = [_THISROW].[brandId])`

- `drinkingDate`: Date、Required = ON、Initial value = `TODAY()`
- `rating`: Enum (Base type Number)、Required = ON、Values = `1,2,3,4,5`、Input mode = Buttons、Initial value = **空白**（3を自動設定しない）
- `aromaTagIds`: EnumList (Base type Ref → Tags)、Required = OFF、Valid_If:

  `SELECT(Tags[tagId], AND([category] = "aroma", [isActive] = TRUE))`

- `tasteTagIds`: EnumList (Base type Ref → Tags)、Required = OFF、Valid_If:

  `SELECT(Tags[tagId], AND([category] = "taste", [isActive] = TRUE))`

- `sweetDry`, `lightRich`, `acidity`, `umami`: Enum (Base type Number)、各1〜5、Optional、初期値は空白。
  - sweetDry: 1=辛口、5=甘口
  - lightRich: 1=軽快、5=濃醇
  - acidity: 1=穏やか、5=強い
  - umami: 1=淡い、5=豊か
- `comment`: LongText
- `drinkingPlace`: Text、`priceJPY`: PriceまたはDecimal
- `createdAt`: DateTime、Initial value = `NOW()`

### Photos
- `photoId`: Text、Key、Initial value = `UNIQUEID()`
- `reviewId`: Ref → Reviews、Required = ON、**IsPartOf = ON**（Reviewsフォームに写真の追加欄を表示）
- `imageFile`: **Image**、Required = ON（これがカメラ撮影・Google Drive保存を担う）
- `photoType`: Enum（表ラベル / 裏ラベル / ボトル / 料理 / その他）、Initial value = `"表ラベル"`
- `caption`: Text、`capturedAt`: DateTime、Initial value = `NOW()`
- `aiStatus`: Enum（未解析 / 解析済 / 要確認 / 解析失敗）、Initial value = `"未解析"`
- 画像の格納先を権限分離された個人Driveにする。AppSheet初期設定の相対フォルダを利用し、公開URLとして保存しない。

### Tags
- `tagId`: Text、Key
- `tagLabel`: Text、Label
- `category`, `tagGroup`: Text
- `displayOrder`: Number
- `isActive`: Yes/No
- **Read only**に設定。47語はすでに原本のSheetsに入力済み。

## 3. 画面設定（UX > Views）

スマートフォンの Primary Navigation は次の順番を推奨。

| ビュー名 | 対象 | ビュータイプ | 表示位置 |
|---|---|---|---|
| 飲酒履歴 | Reviews | Deck | Primary |
| 銘柄を探す | Brands | Deck | Primary |
| 記録する | Reviews | Form | Primary |
| 写真 | Photos | Gallery | Menu |
| 商品一覧 | Bottles | Deck | Menu |

- `Reviews_Form` は自動生成されたフォームを使い、列順を `brandId → bottleId → drinkingDate → rating → aromaTagIds → tasteTagIds → sweetDry → lightRich → acidity → umami → comment` とする。
- `Photos.reviewId` を `IsPartOf` にすると、レビューの関連画像を追加しやすくなる。フォームで画像入力の表示を確認。
- `Brands` は `brandName` を主表示、`breweryName` と `prefecture` を補助テキストとし、検索バーを有効化。
- 新規登録では `brandId` / `reviewId` をユーザーに入力させない。
- `Brands` 詳細画面に、リンク先 `LINKTOFORM("Reviews_Form","brandId",[brandId])` のアクション「この日本酒を記録」を追加。
- ブランドが検索で見つからない場合、`Brands_Form` の追加ボタンから手入力する。

### さけのわ帰属表示

さけのわを使う画面の分かりやすい位置に以下を表示する：

> さけのわデータを利用しています — https://sakenowa.com

`Brands`の詳細画面に表示文言と、`LINKTOURL("https://sakenowa.com")` を用いた外部リンクアクションを設置し、機能することを確認。

## 4. 銘柄データの初回取り込み

1. 前述の Google Sheets を開く。
2. `拡張機能 > Apps Script` でバインド型スクリプトを開く。
3. 本リポジトリ `scripts/appsscript/Code.gs` の内容を貼って保存。
4. `validateSakefolioTemplate` を実行して許可し、成功を確認。
5. `refreshSakenowaBrands` を実行。初回OAuth権限付与が必要。
6. Sheets `Brands` の件数を確認。AppSheetで **Sync** を実行。
7. `source=manual` の行が変更されないことを確認。

スクリプトは `Brands` 以外のテーブルを変更しない。公式銘柄は `sw-<id>`、手動銘柄は `manual-<UNIQUEID()>` のIDを使う。

APIエラーや構造不正があった場合はシート変更前に停止する。外部API提供元の利用条件・帰属表示は [さけのわデータ公式](https://muro.sakenowa.com/sakenowa-data/) に従う。

## 5. 家族配布・個人データ分離

**閲覧者への普通のAppSheet共有**では同一データソースを使用するため、今回の目的では使わない。

1. 原本アプリの Reviews / Bottles / Photos に個人データがないことを確認。
2. AppSheetの共有権限で、家族に `View definition`（コピー可能）を付与する。
3. 家族は自分のアカウントから共有されたアプリを **Copy**。
4. コピー時に**アプリデータもコピー**する設定と、画像ファイルのコピー（画像がある場合）を確認。
5. `Data > Tables` の各参照元スプレッドシートと画像フォルダが、コピー先本人のDriveになっているか確認。
6. 本人のレビューと画像を各1件作成し、元テンプレートにも他の利用者にも表示されないことを検証。
7. 実データが入った親アプリを `View definition` で他人に共有しない。

参考: https://support.google.com/appsheet/answer/10104387?hl=ja

## 6. 未実装と制約

- **AI画像認識：未実装。** 写真を記録・参照するところまでがMVP。
- AppSheetエディタの自動生成は、このリポジトリでは行わない。設定手順を参照して実機作業すること。
- 公式データは銘柄単位であり、個別の純米吟醸・限定酒は Bottles に任意登録。
- ブランド全件を取り込むと端末性能・同期時間に影響する可能性があるため、実機で測定する。
- AppSheetの無料利用条件・デプロイ条件は利用形態ごとに公式料金表で確認する。

## 7. 受入基準

`docs/QA.md` に従い、iPhoneと別Googleアカウントで実機検証し、動作未確認機能を「完成」と報告しない。
