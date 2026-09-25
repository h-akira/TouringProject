# 共通して必要になる準備

> ⚠️ **まだ実行しないこと。** 手段が決まってから着手する（[README.md](README.md)）。
> 📌 **ここに書くのは「どの案を選んでも要るもの」**。

## ⚠️ 先に知っておくこと

⚠️ **サービスアカウントは作ってすぐには動かない。**
**Google側での有効化に最大24時間かかることがある。**
📌 **着手するなら、実際に使う日の前日までに作っておくとよい。**

## 1. Google Cloud のプロジェクト

⚠️ **Play Console とは別のサービス。** アカウントは同じでよい。

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作る
2. **Google Play Android Developer API** を有効化する

📌 **課金は発生しない**（このAPIの利用自体は無料）。

## 2. サービスアカウント

**Google Cloud Console → IAM と管理 → サービスアカウント → 作成**

⚠️ **GCP側のロールは付けない。** 📌 **必要なのはPlay側の権限だけ**で、
**GCPのリソースには一切触らない。**

**作成後、キー（JSON）を発行してダウンロードする。**

⚠️ **このJSONは「Playにアプリを公開できる権限」そのもの。**
⚠️ **絶対にコミットしない。** ⚠️ **`.gitignore` 済みの場所にも置かないほうがよい**
（**GitHub Secrets に入れたら手元からは消す**）。

## 3. ⚠️ Play Console 側で権限を与える

**Play Console → ユーザーと権限 → 新しいユーザーを招待**

⚠️ **サービスアカウントのメールアドレス**（`...@....iam.gserviceaccount.com`）を入れる。

⚠️ **権限は最小限に絞る:**

| 与える | 与えない |
|---|---|
| ✅ **リリースの作成・内部テストへの公開** | ❌ **本番トラックへの公開** |
| ✅ **対象アプリのみ**（全アプリではなく） | ❌ **財務データ・ユーザー管理** |

📌 **「アプリを選択」で `Touring Assistant` だけに限定できる。**
⚠️ **本番公開の権限を与えないことで、事故で一般公開される経路を塞ぐ。**

## 4. GitHub Secrets

**リポジトリ → Settings → Secrets and variables → Actions → New repository secret**

| 名前（案） | 中身 | 要否 |
|---|---|---|
| `PLAY_SERVICE_ACCOUNT_JSON` | ⚠️ **サービスアカウントのJSON全文** | **必須** |
| `TRG_KEYSTORE_BASE64` | ⚠️ **`.jks` を base64 化したもの** | ⚠️ **CIで署名する場合のみ**（論点②） |
| `TRG_KEYSTORE_PASSWORD` | キーストアのパスワード | 同上 |
| `TRG_KEY_ALIAS` | `upload` | 同上 |
| `TRG_KEY_PASSWORD` | 鍵のパスワード | 同上 |

**base64化のコマンド**（⚠️ **決まってから実行する**）:

```sh
base64 -i ~/.keystore/touring-upload.jks | pbcopy
```

⚠️ **`pbcopy` でクリップボードに入る**ので、⚠️ **ターミナルの履歴やファイルに残さずに済む。**

## 5. ⚠️ publicリポジトリでの注意

⚠️ **このリポジトリは public。** **ワークフローの書き方を誤ると、秘密が漏れる。**

| ⚠️ 罠 | 対処 |
|---|---|
| ⚠️ **`pull_request` で動かす** | ❌ **やらない。** **フォークからのPRでSecretsが使われる経路を作らない** |
| ⚠️ **ログに出す** | 📌 **Secretsは自動でマスクされる**が、⚠️ **base64を展開して `cat` すれば出る** |
| ⚠️ **`workflow_dispatch` を誰でも押せる** | 📌 **書き込み権限のある人だけなので、個人リポジトリなら問題ない** |

## 6. 確認の仕方

⚠️ **いきなり本番のワークフローを書かない。**

📌 **まず「サービスアカウントでAPIが叩けるか」だけを確かめる**のが安全。
**既存のリリース一覧を取得するだけの読み取り操作**なら、⚠️ **何も壊さずに権限を確認できる。**

## 参考

- [Google Play Developer API - Getting Started](https://developers.google.com/android-publisher/getting_started)
- [GitHub Actions - Using secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)
