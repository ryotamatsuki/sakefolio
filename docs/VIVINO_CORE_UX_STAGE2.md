# Sakefolio Stage 2: Vivino-style core UX implementation

更新: 2026-10-15。**AppSheetのビュー/列/アクションは、この文書の設定をAppSheetエディタへ適用する必要がある。** GitHubやSheetsの更新だけでAppSheetの画面は変わらない。実AppSheet App ID: `280ba1b7-078b-45f1-a39b-c7dea2152da9`。

既存データ・写真を消さず、AI/有料Bot/SNSなしで実装する。

## 適用順序（重要）

1. [Sakefolioデータソース](https://docs.google.com/spreadsheets/d/1cBNEjeYFZMbmumXSckBLrRfQAKqWRzFnofUo6TWyBZs/edit) の **Wishlist** シートがあることを確認。
2. [AppSheetエディタ](https://www.appsheet.com/template/appdef?appId=280ba1b7-078b-45f1-a39b-c7dea2152da9&appName=Sakefolio-1001343060) の Data > [+] から、**同じGoogle SheetsのWishlistタブ**を新しいテーブルとして追加（既存5テーブルを置き換えない）。
3. Data > ColumnsでWishlistのKey/Ref/DateTimeを設定して保存。
4. Reviewsに**仮想列**を追加して代表写真・都道府県・表示タイトルを定義。
5. App > Views の既存ビューを修正して、不要な重複ビューを非表示。
6. ActionsとSlicesを追加。
7. AppSheetのエラー/警告を確認後、レビューと写真が消えていないことを確認。
8. iPhoneで一連の操作を試験してから家族へ配布。

### 誤操作防止

- AppSheetで「Regenerate structure」をクリックする前に**対象テーブルの既存仮想列、式、タイプ設定を控える**こと。
- 今回、Brands / Reviews / Photos のスプレッドシート本体の列は変更していないので、それらを再生成する必要はない。
- Wishlist の「Data > Add table」を行うだけではRef列は自動確定しない。
- 既存の `Reviews`, `Photos`, `Brands` を削除・再作成しない。
- 個人の画像を使ってデモを公開しない。

## 1. 写真付きコレクション（履歴カード）

### 1-A. Reviews の仮想列 `coverImage`

Data > Reviews > Add virtual column

| 設定 | 値 |
|---|---|
| Column name | coverImage |
| Type | Image |
| App formula | 下記 |
| Editable | off |

```appsheet
IF(
  ISNOTBLANK(
    ANY(
      SELECT(
        Photos[photoId],
        AND(
          [reviewId] = [_THISROW].[reviewId],
          [photoType] = "表ラベル"
        )
      )
    )
  ),
  ANY(
    SELECT(
      Photos[imageFile],
      AND(
        [reviewId] = [_THISROW].[reviewId],
        [photoType] = "表ラベル"
      )
    )
  ),
  ANY(
    SELECT(
      Photos[imageFile],
      [reviewId] = [_THISROW].[reviewId]
    )
  )
)
```

表ラベルを優先し、ない場合はその他の写真、写真自体がない場合は空欄。**Image型の画像ファイルパスの表示が実機で正しく解決されることを検証する。** 元画像はPhotosを正本とし、Reviewsには重複保存しない。端末負荷が高い場合はPhotoから代表写真フラグの保持方式へ移行。

### 1-B. Reviews の表示用仮想列

`reviewTitle` (Text; Label候補):
```appsheet
CONCATENATE(
  [brandId].[brandName],
  IF(
    ISNOTBLANK([bottleId]),
    CONCATENATE(" / ", [bottleId].[productName]),
    ""
  )
)
```

`reviewSubtitle` (Text):
```appsheet
CONCATENATE(
  "★", [rating],
  "  •  ",
  TEXT([drinkingDate]),
  IF(
    ISNOTBLANK([brandId].[prefecture]),
    CONCATENATE("  •  ", [brandId].[prefecture]),
    ""
  )
)
```

`reviewPrefecture` (Text): `[brandId].[prefecture]`

### 1-C. 飲酒履歴ビュー

- View name: `飲酒履歴` / Data: Reviews / Type: Deck / Position: Primary
- Main image: `coverImage`
- Primary header: `reviewTitle`
- Secondary header: `reviewSubtitle`
- Sort by: `drinkingDate` Descending, `createdAt` Descending
- On row selected: 詳細表示（既定）。
- 写真がないレビューでもカード自体は残す。

公式参考: https://support.google.com/appsheet/answer/10106514?hl=ja

## 2. 銘柄詳細画面を充実

App > Views > `Brands_Detail`（System-generatedのDetail）で以下を設定。

- Header: `brandName`
- 表示順: `brandName` → `breweryName` → `prefecture` → `[Related Reviews]`（自動Ref逆参照列が生成されていれば）→ 関連商品 `[Related Bottles]`
- 管理内部列: `brandId` / `breweryId` / `areaId` / `source` / `createdAt` / `updatedAt` は表示しない
- 公開情報の出典: 「さけのわデータを利用しています」＋ https://sakenowa.com を分かりやすい場所に表示。
- 詳細アクション `この日本酒を記録` の Target:

```appsheet
LINKTOFORM("Reviews_Form", "brandId", [brandId], "drinkingDate", TODAY())
```

- 詳細アクション `飲みたいリストに追加` は後述のWishlistアクションを設定。
- `Related Reviews` の名前は環境ごとに異なる可能性があるので、列一覧で実際の逆参照仮想列を確認して選択する。

## 3. レビュー登録簡素化と「もう一度飲む」

### 3-A. Reviews_Form

最初に必須の銘柄と評価を配置し、写真・タグは任意とする。推奨列順:

```text
brandId          銘柄（必須）
rating           評価（必須・初期値なし）
drinkingDate     飲んだ日（初期値TODAY()）
[Related Photos] 写真（IsPartOfの子フォーム）
aromaTagIds      香りタグ
tasteTagIds      味わいタグ
bottleId         商品詳細（任意）
sweetDry         甘辛（任意）
lightRich        濃淡（任意）
acidity          酸味（任意）
umami            旨味（任意）
comment          感想（任意）
drinkingPlace    飲んだ場所（任意）
priceJPY         価格（任意）
```

- IsPartOf Photos 子参照フィールドの位置をフォームで確認する。表示名は「ラベル・写真」。
- `brandId` は Ref Brands、`rating` はEnum 1〜5（Buttons）、`drinkingDate` は `TODAY()`
- `aromaTagIds` と `tasteTagIds` はEnumList (Base type Ref → Tags)、タグ候補は既存のカテゴリValid_Ifで絞り込む。
- Form Saved は飲酒履歴に遷移する `LINKTOVIEW("飲酒履歴")` を設定する（Form Savedイベントの使用可否を現行エディタで確認）。
- 写真は既存Photosへ1対多で保存し、Reviewsの画像パス列は新設しない。

### 3-B. Reviews 行アクション `もう一度飲む`

Behavior > Actions > New action

| 設定 | 値 |
|---|---|
| For a record of | Reviews |
| Action type | App: go to another view within this app |
| Display name | もう一度飲む |
| Icon | repeat |
| Prominence | Display prominently |

Target:
```appsheet
LINKTOFORM(
  "Reviews_Form",
  "brandId", [brandId],
  "bottleId", [bottleId],
  "drinkingDate", TODAY()
)
```

**新しい`reviewId`は必ずUNIQUEID()で作成し、既存レビューは上書きしない。** 評価とタグはあえてコピーしない（飲むたびに独立評価）。

## 4. 飲みたいリスト（Google Sheetsへ新規作成済み）

### 4-A. Wishlistテーブル

新規作成済み `Wishlist` タブのヘッダー:

```
wishlistId,brandId,bottleId,wishNote,priority,status,addedAt,updatedAt
```

AppSheet列設定:

| 列 | 型 | 設定 |
|---|---|---|
| wishlistId | Text | Key / UNIQUEID() / Show? off |
| brandId | Ref | Brands / Required |
| bottleId | Ref | Bottles / Optional / valid_If below |
| wishNote | LongText | 任意 |
| priority | Enum | 高・中・低（初期値中） |
| status | Enum | 飲みたい・保留・飲んだ（初期値飲みたい） |
| addedAt | DateTime | Initial value NOW() |
| updatedAt | DateTime | 任意。更新日時を必要とするならChangeTimestamp列を検討 |

`bottleId` Valid_If:
```appsheet
SELECT(Bottles[bottleId], [brandId] = [_THISROW].[brandId])
```

### 4-B. Brands から一発登録するアクション

- For a record of: Brands
- Action type: **Data: add a new row to another table by using values from this row**
- Table to add to: Wishlist
- Set columns: `wishlistId = UNIQUEID()`, `brandId = [brandId]`, `priority = "中"`, `status = "飲みたい"`, `addedAt = NOW()`
- Display name: `飲みたい`; icon: `bookmark`
- Only if:

```appsheet
NOT(IN([brandId], SELECT(Wishlist[brandId], [status] = "飲みたい")))
```

- 既に「飲みたい」に登録されている銘柄には重複ボタンを表示しない。後で商品単位のウィッシュリストが必要になった場合は照合条件を拡張する。
- 実データに対して必ず新規追加と再同期を検証する。アップロードやAPI呼び出しは不要。

### 4-C. Wishlistビュー

- Slice name: `WishlistActive`, source Wishlist, condition `[status] = "飲みたい"`
- View name: `飲みたい`, source `WishlistActive`, type Deck, Primary
- Primary header: `[brandId].[brandName]` の仮想列（`wishTitle`）または参照ラベル `brandId`
- Secondary header: `[brandId].[breweryName]` の仮想列（`wishBrewery`）
- Sort: `priority` の文字順に頼らず、優先度の数値補助仮想列 `priorityOrder` を追加:
  `SWITCH([priority], "高", 1, "中", 2, "低", 3, 2)`
- Sort `priorityOrder` Asc → `addedAt` Desc
- 通常のデータ編集でStatusを「飲んだ」へ変更可能

## 5. 検索強化・履歴フィルター

### 5-A. 銘柄を探す

- Brands / Deck、Searchを有効化
- Searchable の対象: `brandName`, `breweryName`, `prefecture`
- Main header: `brandName`; secondary: `breweryName`; summary: `prefecture`
- Sort: `brandName` Asc
- 手動新規銘柄追加への導線 `Brands_Form` を明確に表示
- さけのわAPIにない商品を検索できなくても、ブランドは手動追加可
- **ふりがな・別名検索は、マスターに読み情報がないため現状は未対応**。後続段階で独立辞書列を用意する。未取得かなを架空値で埋めない。

### 5-B. 高評価・産地別

- Reviews の仮想 `reviewPrefecture` は上記で作成済み
- Slice `ReviewsHighlyRated`: `[rating] >= 4`
- View `お気に入り`: source `ReviewsHighlyRated`, type Deck, Menu, image `coverImage`, sort `drinkingDate` Desc
- View `産地別`: source Reviews, type Deck, Menu, group by `reviewPrefecture`, sort `drinkingDate` Desc
- 既存の `飲酒履歴` は全件、日付降順を維持
- モバイルで多数のビューをPrimaryに追加せず、Primaryは `飲酒履歴` / `銘柄を探す` / `記録する` / `飲みたい` の4つに絞る。

## QA（設定後に実機で検証）

1. 写真ありレビューが主画像を表示、写真なしレビューも開ける
2. Brands詳細で酒蔵・産地と過去のレビューを表示
3. BrandsまたはReviewsから「記録する／もう一度飲む」で新しいreviewIdを発行
4. 以前の評価・タグが意図せずコピーされない
5. Wishlist登録→AppSheet同期→Google Sheetsに新行追加
6. Wishlistで同じ銘柄を二重登録しない
7. Wishlist status=飲んだ で `飲みたい` から消える
8. 高評価sliceで4/5のみ、産地別グルーピングが正しく働く
9. 漢字銘柄・酒蔵名・都道府県を検索
10. 既存 Reviews / Photos / Brands の件数・データが破壊されない
11. 別アカウントにコピーした後もWishlistを含む6テーブルと写真フォルダが本人所有

このファイルの存在はAppSheet本体への適用を証明しない。AppSheetエディタに反映し、QAを実測して完了判定する。
