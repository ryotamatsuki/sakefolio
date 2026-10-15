# Sakefolio MVP QA / 受入試験 v1.2

更新: 2026-10-15 JST。AppSheet本体を生成し、クラウドブラウザで基本動作を検証した。iPhone実機・家族配布は未検証。

## 実アプリ
- App ID: `280ba1b7-078b-45f1-a39b-c7dea2152da9`
- 起動: https://www.appsheet.com/start/280ba1b7-078b-45f1-a39b-c7dea2152da9?platform=desktop
- 編集: https://www.appsheet.com/template/appdef?appId=280ba1b7-078b-45f1-a39b-c7dea2152da9&appName=Sakefolio-1001343060
- Google Sheets: https://docs.google.com/spreadsheets/d/1cBNEjeYFZMbmumXSckBLrRfQAKqWRzFnofUo6TWyBZs/edit
- 状態: Prototype（未デプロイ）。課金・公開共有は変更していない。

## 検証済み
- [x] 5テーブル Brands / Bottles / Reviews / Photos / Tags を同じSheetsの各タブへ接続
- [x] 主キーとRef: Bottles→Brands、Reviews→Brands/Bottles、Photos→Reviews
- [x] Photos.reviewId の IsPartOf によりレビュー内から子写真を追加
- [x] Photos.photoId をText + UNIQUEID()の単独Key、imageFileをImageへ修正
- [x] Tags.tagLabel をLabel、TagsをRead-only
- [x] 5画面: 飲酒履歴 / 銘柄を探す / 記録する / 写真 / 商品一覧
- [x] レビュー・写真・銘柄の主要項目を日本語化、内部IDや管理日時を非表示
- [x] 5段階評価、香り・味わいのEnumList Ref、カテゴリ別Valid_If
- [x] 甘辛・濃淡・酸味・旨味を1〜5の任意選択、初期値空
- [x] 公開さけのわAPIのareas/breweries/brandsを直接取得し、Brandsへ3,303行を初回投入
- [x] 全3,303行をSheetsから読み戻し、投入値との完全一致を確認
- [x] 石鎚の検索で石鎚・石鎚正宗を表示
- [x] 石鎚、評価4、香り「梨・りんご」、味わい「なめらか・米の旨味」の保存・履歴表示
- [x] 保存行にsw-914、aroma_pear/aroma_apple、taste_smooth/taste_rice_umamiを保持
- [x] 任意4尺度が空のままSheetsに保存されることを確認
- [x] テスト画像PNGをレビュー内の写真フォームから選択・保存
- [x] Photosへ相対画像パス Photos_Images/<photoId>.imageFile.<time>.png を保存
- [x] アプリの画像拡大表示でテストPNGの内容を目視確認
- [x] 再読込後も写真レコードと詳細画面を表示
- [x] テストレビュー削除後、ReviewsとPhotosにテストレコードが残らないことをSheets読み戻しで確認
- [x] 公式銘柄の名前・酒蔵・産地のEditable_If=[source]="manual"、銘柄の削除を禁止
- [x] 新規手動銘柄の初期値manualとmanual-UNIQUEID()を設定
- [x] 銘柄詳細に「銘柄データ提供：さけのわ」のUrl仮想列を設定・保存

## 未検証・次工程
- [ ] iPhone Safari / AppSheet mobileでのカメラ撮影、表裏2枚の保存・再表示
- [ ] 家族の別Googleアカウントへのアプリ+データコピー、所有権・画像フォルダ・相互非干渉
- [ ] 未登録銘柄の手動登録からレビューまでの通し試験
- [ ] 商品登録フォームの酒種・製法等の詳細な選択肢整備、商品変更時の整合性試験
- [ ] 漢字以外の検索、酒蔵名・かな検索の対応範囲
- [ ] 帰属リンクを実アプリから開く通し試験
- [ ] 写真ギャラリーのサムネイル表示・複数画像・低速回線時の挙動
- [ ] 履歴の日時降順、写真サムネイルなど追加UI調整
- [ ] GAS validateSakefolioTemplate / refreshSakenowaBrands のGoogleアカウント上での実行
- [ ] 無料利用条件・家族コピー方式の最終確認とデプロイ判定

## 区別
初回のAPI取得とデータ投入は、Pythonで公開APIを取得してGoogle Sheets接続から反映した。GASの実行成功を意味しない。
ブラウザでのPNGファイル選択は、iPhoneカメラ撮影の検証を意味しない。
家族用の分離を未検証のまま完成扱いにしない。AI画像解析は未実装。
テスト画像のDrive上の実ファイル削除は未確認（レコードは削除確認済み）。


## Stage 2（Vivino基本5機能）— 2026-10-15

### データ層の実装完了
- [x] Google SheetsにWishlistタブ8列を追加（既存6+説明タブを維持）
- [x] Wishlist.status（飲みたい / 保留 / 飲んだ）とpriority（高 / 中 / 低）に選択制約設定
- [x] 既存Reviews、Photos、Brandsのレコードを削除・置換せず追加
- [x] 「UX改修Stage2」タブにAppSheet適用値と状態を記録
- [x] docs/VIVINO_CORE_UX_STAGE2.md に5機能分のビュー/仮想列/アクション/スライス仕様を作成

### AppSheet本体への適用・ブラウザ試験 — 2026-10-15

- [x] 同じSheetsのWishlistを6番目のテーブルとして接続。Key/Ref/Enum/DateTime、初期値を設定
- [x] Reviews.coverImage、reviewSubtitle、reviewPrefectureを仮想列として追加。reviewTitleを銘柄・商品名へ整理
- [x] 飲酒履歴を写真・評価・日付・産地付きDeckに更新。飲んだ日降順、作成日時降順。写真なしの記録も表示
- [x] 銘柄詳細に日本語の銘柄・酒蔵・産地、関連記録・商品、さけのわ出典を表示。関連ReviewsもDeckに変更
- [x] 「この日本酒を記録」「もう一度飲む」を追加。銘柄・商品を引き継ぎ、新規レビューを作成
- [x] 記録する/Reviews_Formを銘柄→評価→日付→写真→タグ→商品→任意項目の順に整理。Finish view=飲酒履歴
- [x] WishlistActiveと飲みたいDeck、Brandsからの追加、登録済みボタン抑止を設定
- [x] お気に入り（rating>=4）と産地別（reviewPrefecture）をMenuへ追加
- [x] Primaryを飲酒履歴/銘柄を探す/記録する/飲みたいの4つに整理
- [x] 銘柄「テスト」、県名「愛媛県」、酒蔵「梅錦山川」で検索結果を確認
- [x] 保存済みレビュー0189a270の代表写真を履歴で目視確認
- [x] 「もう一度飲む」から評価・タグが空のフォームを開き、評価4・写真なしの試験レビュー48a9b957を保存。Sheetsに新ID、空のタグ/尺度を確認
- [x] お気に入りに評価4だけが表示、評価3が含まれないことを確認
- [x] 産地別で愛媛県グループに両レビューを表示
- [x] Wishlist試験行30d07888を追加、SheetsにbrandId/中/飲みたい/日時を確認。追加後ボタン非表示、状態飲んだで一覧から除外
- [x] 今回の試験レビュー・Wishlist行をアプリから削除し、Sheetsで消失を確認。元のレビュー0189a270・写真43a9f36fの全取得セルと画像相対パスは変更前と同じ
- [x] エディタ保存後、実アプリ再読込で配色・画面・日本語ラベル・ナビゲーションアイコンを確認

### デザイン適用

参照: ryotamatsuki/design-md-references の airbnb/DESIGN.md と wise/DESIGN.md。
Airbnbの白い画面・写真と情報の優先順位、Wiseのforest #163300をAppSheet標準UIへ適用。
Light、Primary #163300、Black/White、Open Sans、画面名ヘッダーを設定。
履歴はbook-open、検索search、記録plus、飲みたいbookmark、お気に入りstar。
再記録はrepeat、Wishlist追加はbookmark。検索一覧の操作バーを隠して銘柄/酒蔵/産地を表示。
CSSや独自コンポーネントの移植ではなく、AppSheetが提供するテーマ・Deck・アイコンによる適用。

### 残る検証

- [ ] iPhone実機のカメラ・複数写真・低速回線
- [ ] 家族の別Googleアカウントへの6テーブル・画像フォルダの所有権を含むコピー試験
- [ ] 商品ありの再記録、商品候補変更の整合性、多数のWishlistの優先順の実データ試験
- [ ] 写真なし→表ラベルなし→複数表ラベルの代表選択パターン（式は設定済み、今回目視は既存表ラベル1枚）
- [ ] かな/別名検索はマスターに読み情報がなく未対応

**判定**: 5機能をAppSheet本体へ適用し、上記ブラウザ/Sheets試験を実施。iPhone・別アカウントコピーの受入は未完了。PRはDraft、アプリはPrototypeを維持。AI認識は対象外。
