# Sakefolio MVP QA / 受入試験 v1.0

## この時点で検証済み

- [x] Google Sheets は Google Drive 上で作成済み
- [x] Google Sheets に Brands / Bottles / Reviews / Photos / Tags の5テーブル存在
- [x] Tags に香り26・味わい21、計47件の選択語彙
- [x] AppSheetエディタ用列設定・View設計を文書化
- [x] 公開さけのわAPIから取り込む Apps Script コードをGitHubに追加

## 未実行（AppSheetにログインできる環境が必要）

- [ ] AppSheetエディタでSakefolioアプリを生成
- [ ] 5テーブル全てがSheetsの正しいタブを参照
- [ ] Brand/Review/Photo等のKey、Ref、Labelを設定
- [ ] GASの `validateSakefolioTemplate` 実行
- [ ] GASの `refreshSakenowaBrands` 実行
- [ ] 公式銘柄の取り込み件数を確認
- [ ] 銘柄の検索（漢字・かな・酒蔵名）
- [ ] 銘柄未掲載時の手入力登録
- [ ] ブランドIDが空でないレビューの保存
- [ ] 星評価1〜5と任意タグの保存
- [ ] 甘辛/濃淡/酸味/旨味の空欄が勝手に3にならない
- [ ] 表ラベル・裏ラベルを撮影し各画像がDriveに保存される
- [ ] 記録編集・再同期・削除
- [ ] 同じ銘柄を2回レビューして独立レコードになる
- [ ] AppSheet内部画面に帰属表示と公式URLへの動作するリンク
- [ ] iPhone Safari / AppSheet mobile で撮影・保存・再表示
- [ ] データ損失なくアプリ再起動後の履歴再現
- [ ] 別Googleアカウントでアプリ+データをコピー
- [ ] コピー先のSheets / Driveが本人所有であり元の個人レビューや画像を参照しない
- [ ] 家族Aの編集が家族Bのシートに反映されない
- [ ] コピー後のアプリで画像の追加・閲覧が可能

## 注意すべき障害

1. **Refが文字列になっている**: AppSheetの列型をText→Refに変え、参照テーブルを指定する。
2. **EnumListがIDを文字で見せる**: Tagsの`tagId`をKey、`tagLabel`をLabelに設定する。
3. **写真が保存されない**: Image型、フォルダ権限、保存場所と同期待ちを確認する。
4. **Brand選択肢が空**: Apps Scriptを実行して公式データ取り込み、AppSheetでSync。
5. **所有権が分かれていない**: アプリを単純共有したのではなく「アプリとデータをコピー」したか確認する。
6. **アプリのコピーができない**: 共有権限（View definition）、AppSheetアカウント、共有ポリシーを確認する。

## 判定ルール

- `データテンプレート完成` と `AppSheetアプリが動作` は別の判定。
- シートの存在だけでアプリ完成としない。
- Apps Script は実アカウントで権限承認、実行ログ、API取り込み件数を確認するまで「動作未検証」。
- 家族への配布は、別アカウントでの所有権・画像参照の分離試験をPASSしてから。
- 無料利用可能性は利用者数とプラン/アカウントの適用条件に依存し、無条件無料とは保証しない。

## 2026-10-15 開発メモ

Google Sheetsの構造は実接続のGoogle Driveで確認済み。AppSheet管理画面の操作・GASの実行・iPhone撮影テストは未実施であり、未検証項目はPASSにしない。
