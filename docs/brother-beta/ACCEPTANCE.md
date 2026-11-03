# Brother Beta：最終受入試験

現状の判定は **NO GO**。
空欄・NOT RUN・過去版の成功を今回のPASSへ繰り上げません。
記録する証拠は、対象ソースSHA、専用URL、日時、端末OS/Safari版、操作と結果、合成データの件数だけ。
トークン、メールアドレス、実写真、Driveの非公開IDは公開リポジトリへ貼りません。

## 実GoogleアカウントA/B

事前に本人・所有者から許可された2アカウントを使用。
受入試験中は秘密を含まない合成写真・一意の `UXTEST-` 名だけを保存し、既存記録を変更しません。

| 項目 | 操作と合格条件 | 状態 |
|---|---|---|
| 配信物 | `verify:beta` が正式オリジン・ソースSHA・HTTPヘッダー・実バンドルの一致を確認 | NOT RUN |
| A初回 | Aでログインし、自分のDriveだけに検証保存先・記録が作られる | NOT RUN |
| 写真 | 合成写真付き1件保存。再読込・再認証後も写真と記録が各1件、位置情報なし、非共有 | NOT RUN |
| A→B | ログアウトしてBでログイン。Aの記録・写真・未完了入力が表示されない | NOT RUN |
| B→A | Bで別の1件保存。Aに戻るとAだけ、Bに戻るとBだけ | NOT RUN |
| 複数タブ | 同一オリジンの2タブ。ログアウト同期、同時保存の停止/再試行、A/Bタブに他方のデータなし | NOT RUN |
| 非同期 | 読取り・写真・保存・編集・ゴミ箱・復元中にログアウト。旧完了が新セッションを更新せず後続API開始なし | NOT RUN |
| 失効 | 認証失効・Google権限取消し後、成功表示を出さず接続を解除/再接続案内 | NOT RUN |
| 通信障害 | 保存前切断と応答消失を検証。再試行・再読込後に同じIDを照合し、記録・写真の二重作成なし | NOT RUN |
| 編集 | 評価・感想・商品名・写真を変更し、IDは維持。古い画面からの編集は競合を案内 | NOT RUN |
| ゴミ箱 | 誤削除→復元。元写真を消さず、再試行後も1件に戻る | NOT RUN |
| バックアップ | 写真付きJSONを書出し、明示した検証アカウントへ復元。再インポートで増殖せず写真も再表示 | NOT RUN |
| 不正入力 | MIME偽装、欠損画像、重複ID、別アプリ/共有ファイル参照を拒否し既存データを上書きしない | NOT RUN |
| 整合性 | 写真ファイル/Reviews/Photos/Bottlesの参照が一致。中断で残った孤立候補を勝手に削除しない | NOT RUN |

意図的な「バックアップの選択とインポート」はユーザーが指定したデータ移行です。
アカウント切替だけで他方の記録が現れる動作とは区別してください。
Google Sheetsには端末を跨ぐ原子的compare-and-swapがありません。
Web Locksは同一オリジンの対応ブラウザ内の排他であり、複数端末同時編集の完全保証にはなりません。
競合確認と最終読取りを行い、限定試用では同一記録を複数端末で同時編集しないでください。

## iPhone Safari実機

実機のiOS版・Safari版、機種を記録。
WebKit emulationを実機と呼びません。

- [ ] Safariから正式URLを開き、Googleのポップアップ認証・再ログイン。
- [ ] 銘柄検索、日本語入力、評価、感想入力、保存・編集・削除・復元。
- [ ] カメラ撮影とフォトライブラリ選択。PNG/JPEG/HEICについて対応/非対応の案内。
- [ ] 横はみ出し・キーボードでボタンが隠れる問題・タップ領域・スクロールを確認。
- [ ] ブラウザ終了後の再訪、通信切替、保存失敗からの復帰。
- [ ] 写真付きバックアップのダウンロードとファイル選択からの復元。

この版はIndexedDB、Web Locks、AbortSignal.timeout/anyなどを使います。
未対応・ストレージ利用不可時に安全に停止することも確認。
古いSafariはOS更新または対応端末で試験してください。

## GO記録

- sourceCommit: 未入力
- dedicatedOrigin: 未配信
- live headers / actual bundle: NOT RUN
- authorised account A/B tests: NOT RUN
- iPhone hardware: NOT RUN
- real photo backup/recovery: NOT RUN
- actual Google quota/billing/storage check: NOT RUN
- owner invitation approval: NOT RUN

上記の全項目と未解決Critical/Highなしを確認してからGOへ変更し、初めて義兄を試用ユーザーとして招待します。
