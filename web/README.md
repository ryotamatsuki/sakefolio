# Sakefolio React Web — 個人の Google Drive を利用

既存AppSheetは変更しない。React + TypeScript + Viteで独自デザインを実装。専用サーバーや独自データベース不要。Google OAuthのdrive.fileスコープだけを要求し、利用者本人のGoogle SheetsとGoogle Driveに直接保存します。

現状は実装コードです。Google OAuthの設定、実際のGoogleアカウントによる保存試験、公開デプロイはまだ完了していません。

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
- 写真は1件1枚（最大10MB）。編集・削除・オフライン利用、共有・SNS・AI認識、地図上への正確なピン設置、AppSheetデータ移行は未実装。
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
