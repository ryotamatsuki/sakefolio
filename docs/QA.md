# Sakefolio MVP QA / 受入試験 v1.1

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

### AppSheetエディタ未適用・未検証
- [ ] AppSheetへWishlistテーブル追加とKey/Ref/Enum型設定
- [ ] Reviews.coverImage仮想Image列設定・写真カード表示の実機確認
- [ ] Brands詳細の列順、レビュー一覧、アクション配置確認
- [ ] Reviews「もう一度飲む」アクションと簡略化フォームの確認
- [ ] Wishlist登録アクション、重複防止、WishlistActiveビューの操作確認
- [ ] Brandsの銘柄/酒蔵/県名検索と高評価/産地別フィルター
- [ ] 初期レビュー・写真の保存性と別アカウントコピーの回帰試験

**判定**: Google Sheetsデータ構造とAppSheet実装仕様の更新は実施済み。AppSheet画面自体の更新と5機能の動作は未完了。外部APIを使ったAI認識は対象外。
