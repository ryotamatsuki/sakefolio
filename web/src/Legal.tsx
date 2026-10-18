/** Static disclosures; not a substitute for owner-reviewed legal documents. */
export default function Legal(){
 return <section className="page-section interior-section legal-page">
  <div className="interior-head"><h1>プライバシー・利用案内</h1>
    <p>個人の飲酒記録を保存する前に確認してください。正式なサービス提供開始前の案内です。</p>
  </div>
  <h2>Googleアカウントの権限</h2>
  <p>SakefolioはGoogle Identity Servicesを使い、Driveの限定権限（drive.file）を要求します。
    GoogleのパスワードやGmail本文にはアクセスしません。ただし許可されたアプリ所有ファイルの内容を読み書きできます。
    Google認証の実地セキュリティ検査は未完了のため、一般利用者へのGoogle連携はまだ推奨していません。</p>
  <h2>記録の保存先</h2>
  <p>Google接続時、日本酒と中国酒の記録・写真は原則として利用者自身のGoogle Drive / Sheetsへ保存されます。
    Google未接続時の中国酒記録は同じブラウザオリジンのIndexedDBに保存されます。
    閲覧履歴やブラウザデータを消すと端末内データが失われる可能性があります。</p>
  <h2>ゴミ箱とデータ削除</h2>
  <p>ゴミ箱への移動は記録を非表示にし、復元できる方式です。元のGoogle Sheetsの行や写真ファイルを削除するものではありません。
    ゴミ箱操作だけでデータの完全消去・個人情報の削除依頼が完了したと誤解しないでください。</p>
  <h2>写真・外部サービス</h2>
  <p>新しい写真は保存前にPNGへ再エンコードし、EXIF位置情報などを除去する設計です。以前保存した画像は自動で変換されません。
    Wikidata・Open Food Facts・OpenStreetMap等の検索では、利用者の操作に応じて検索語やバーコード番号が各サービスに送信されます。
    外部サービスにはそれぞれの利用規約・プライバシーポリシーが適用されます。</p>
  <h2>利用上の注意</h2>
  <p>掲載されている製品情報や産地は出典・位置精度がさまざまで、正確性は保証されません。
    アプリは開発・検証段階です。重要なデータは別途バックアップしてください。
    適用法令に従い、飲酒が認められる年齢の方のみ飲酒に関する機能をご利用ください。</p>
  <h2>お問い合わせ・不具合報告</h2>
  <p>ご意見・不具合の報告は<a href="https://github.com/ryotamatsuki/sakefolio/issues/new"
    rel="noopener noreferrer" target="_blank">GitHub Issues</a>から送ることができます（GitHubアカウントが必要）。
    個人情報、アクセストークン、保存写真をIssueに公開しないでください。</p>
  <p className="field-help">公開版のプライバシーポリシー・利用規約は所有者による法務レビューと運用主体・連絡先の確定後に正式化が必要です。</p>
 </section>;
}
