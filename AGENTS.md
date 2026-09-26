# AGENTS.md — TouringProject（親リポジトリ）

プロジェクト全体に共通の規約。共通規約（言語・git・コーディングスタイル）は `~/.claude/CLAUDE.md` にあり、ここにはこのプロジェクト固有のものだけを書く。
ユニットに固有の規約は各ユニットの `AGENTS.md` にある（下の表）。

## 1. 前提

バイクの走行中に、インカムのボタンと声で AI と対話するアプリ。⚠️ 走行中は画面を見られず手も使えない。設計で迷ったらこの制約に立ち返る。
学習教材も兼ねるので、判断の過程を残しながら進める。要件は [docs/00_user_stories.md](docs/00_user_stories.md)、方針は [docs/01_technical_policies.md](docs/01_technical_policies.md)。

- Web(PWA) は却下済み（常駐とインカムからの起動がブラウザではできない）。前提を覆さない。
- AWS 側（Backend・Agent）は作り込んでよい。App は薄いクライアントに徹し、UI は最小限にする。迷ったら「その作り込みは走りながら音声で会話する体験に必要か」で決める。

## 2. リポジトリの構成

| パス | リポジトリ | 公開 | 規約 |
|---|---|---|---|
| `App/` | `TouringProject_App` | public | [App/AGENTS.md](App/AGENTS.md) |
| `Backend/` | `TouringProject_Backend` | public | [Backend/AGENTS.md](Backend/AGENTS.md) |
| `Agent/` | `TouringProject_Agent` | public | [Agent/AGENTS.md](Agent/AGENTS.md) |
| `CICD/` | `TouringProject_CICD` | private | [CICD/AGENTS.md](CICD/AGENTS.md) |
| `learning/` | `TouringProject_Learning` | public | `learning/AGENTS.md` |
| `research/` | `TouringProject_Research` | private | `research/AGENTS.md` |

⚠️ ユニットのファイルを触る前に、Read ツールでそのユニットの `AGENTS.md` を読む（Bash の `cat` では規約として読み込まれない）。`CLAUDE.md` はどこにも置かない（置くと `AGENTS.md` が読まれなくなる）。

### submodule の運用

- 作業場所は基本的にこの親リポジトリ。
- ⚠️ サブの変更はサブの中でコミットし、そのあと親でポインタを更新するコミットを作る（`git add <サブ>`、メッセージは `chore: bump <サブ> submodule`）。
- ⚠️ push はサブ → 親の順（ユーザーが行う）。逆だと親が存在しないコミットを指す。`git push --recurse-submodules=check` で検出できる。
- 親のポインタはデプロイと無関係（引き金は各サブの `main`）。「ドキュメントがどの版を前提に書かれたか」の記録なので、区切りのよいところで更新すればよい。
- ⚠️ `.gitignore` はリポジトリごとに別。親の `.gitignore` はサブの中には効かない。

## 3. ドキュメントの置き場

| 場所 | 書くもの | 禁止 |
|---|---|---|
| `README.md` | そのリポジトリの概要・利用方法・手順 | ⚠️ 設計を書かない（docs へ）。経緯を書かない（adr へ） |
| `docs/` | 現在の設計だけ。親はプロジェクト全体（要件・方針・ユニットの定義・契約）、ユニットはそのユニットの中 | ⚠️ 経緯を書かない（「当初は」「廃止した」「〜に変えた」「却下した」） |
| `adr/` | 決定の経緯・却下した案とその理由（§5） | — |
| `docs-parent/`（ユニット） | 親の `docs/` の写し | ⚠️ 編集しない |
| `learning/` | 学習教材（技術そのものを学ぶため。プロジェクト横断の知識） | — |
| `research/` | 実装前の方式検討・技術検討・バグ調査の事実（実測値・スクリプト） | 判断を書かない（adr へ） |
| `.memory/` | 論点と作業（§7） | — |
| `local/` | 手元に恒久的に置く個人のファイル（gitignore） | 追跡しない |
| `tmp/` | 一時的なファイル（gitignore） | 追跡しない |

learning と docs は内容が重複してよい（learning は技術を学ぶため、docs はこのアプリがどう作られているかを示すため）。

### 参照のルール

- 親の `docs/` は起点なので、`docs/` の外へリンクしない（adr へも張らない）。例外は research への絶対 URL（参考）だけ。
- ⚠️ learning へのリンクはどこからも張らない（名前を挙げるのは可）。learning から外へは、例示として絶対 URL で張ってよい。
- research へは、参考としてどこからでも絶対 URL で張ってよい（`https://github.com/h-akira/TouringProject_Research/blob/main/...`。非公開なので他の人には切れて見えるが許容する）。research は独立が原則なので数は少なく保つ。
- ユニットは親の docs を `docs-parent/` 経由で参照する。親の adr・他のリポジトリへは絶対 URL（`https://github.com/h-akira/<リポジトリ>/blob/main/<パス>`）。
- コードのコメントから参照してよいのは、同じユニットの `docs/`・`adr/`、`docs-parent/`、research の絶対 URL だけ。
- ⚠️ 親の絶対 URL で submodule のパス（`TouringProject/blob/main/App/...` 等）を指さない。GitHub では 404 になる。
- 節番号（§7 等）で参照するときは、分割・改番のたびに張り直す。

## 4. 文体

- ⚠️ は「知らないと事故る」ものだけに使う。📌 ✅ ❌ は使わない（表の判定欄は除く）。
- 太字は1段落に1つまで。
- 実測値は根拠として必要なら書いてよい。
- 1ファイルが長くなったら分ける（目安300行）。README は150行を超えたら分割を検討し、250行で必ず分割する。分割したら README にファイルの一覧を置く。

## 5. ADR の書き方

`adr/NNN_<短い題>.md`（リポジトリごとに3桁の連番）。テンプレートは [adr/README.md](adr/README.md)。

- 1ページに収める。詳細は docs、実測は research へ。
- 選択肢には却下した案とその理由を必ず書く（同じ議論を繰り返さないため）。
- 決定が覆ったら本文を書き直す（改訂の節は足さない）。覆る前の案は「選択肢」に却下案として残し、なぜ駄目だったかを書く。元の文は git の履歴に残る。
- 決定の題そのものが変わるほどなら、新しい ADR を書き、古い方のステータスを「置き換え（→ NNN）」にする。
- 日付は最初の決定日、最終更新は書き直した日。
- 番号は再利用しない（却下・置き換えも番号を残す）。

## 6. 契約（docs）を変えるとき

1. 親の `docs/` を直す（契約は `docs/03_units_contracts.md`、API は `docs/04_api_openapi.yaml`）。
2. `docs/sync.sh` を実行し、各ユニットの `docs-parent/` を更新する。
3. ⚠️ 各ユニットで `docs-parent/` をコミットし、親でポインタを更新する（手動。忘れるとユニットは古い契約のまま）。
4. OpenAPI を変えたら App で `npm run gen:api` を実行する。

## 7. 公開リポジトリの鉄則（最重要）

親・App・Backend・Agent・learning は public。一度コミット・push したものは git の履歴に永久に残る。⚠️ コミット前に必ず確かめる。
CICD・research は private だが、秘密は同じく書かない。

| 書いてはいけないもの | 代わりに書く |
|---|---|
| AWS アカウント ID（12桁） | `<ACCOUNT_ID>` |
| 組織 ID / Root ID / OU-ID / SCP-ID（`o-` `r-` `ou-` `p-`） | `<ORG_ID>` 等 |
| ARN（アカウント ID を含む） | `arn:aws:iam::<ACCOUNT_ID>:role/x` |
| アクセスキー・シークレット・API キー・トークン | 論外。環境変数・`.env`（gitignore 済み）へ |
| API の実際の URL | `https://<api-id>.execute-api...` |
| IAM ユーザー名・実在の人のユーザー名 | 役割名で表す |
| ⚠️ ローカルのユーザー名・ホームの絶対パス（ユーザー名と同じ AWS プロファイル名を含む） | リポジトリからの相対パス・`<mgmt-profile>` 等。GitHub のアカウント名（`h-akira`）とは別物 |
| 個人のメールアドレス | 書かない |
| 実際の現在地の座標・住所 | 東京駅などの公共のランドマーク、または「約40km離れた市」のような相対的な表現 |

書いてよいもの: AWS プロファイル名（`touring` 等。ユーザー名と同じものを除く）・リージョン名・サービス名・モデル ID・リソースの命名規約・実測値。

⚠️ 位置情報アプリなので、実機のログや API の応答には開発者の居場所が入る。検証コマンドの出力を貼るときは特に注意する。

### CI/CD の詳細は公開側に書かない

CICD は非公開。公開側（親・ユニットの README・docs・adr）には、CI/CD があること・CodeBuild を使うこと・CICD へのリンクまでは書くが、Agent・Backend のデプロイの構成・権限・順序の仕組み（push が引き金であること等）は書かない。
この `AGENTS.md` と `.memory/` には必要な範囲で書いてよい。各リポジトリの `buildspec.yml` が公開されている程度は問題ない。App の Play 配信（GitHub Actions）は AWS に触らないので対象外。

### コミット前チェック

```sh
# アカウントID(12桁)・組織/Root/SCP-ID・アクセスキーの混入検査
grep -rnE '\b[0-9]{12}\b|\b(o-[a-z0-9]{10,}|r-[a-z0-9]{4,}|p-[a-z0-9]{8,})\b|AKIA[0-9A-Z]{16}' \
  --include='*.md' --include='*.sh' --include='*.yaml' --include='*.py' \
  --include='*.toml' --include='*.ts' --include='*.tsx' --include='*.json' \
  --exclude-dir=node_modules --exclude-dir=local --exclude-dir=tmp .
# ローカルのユーザー名・ホームの絶対パスの混入検査（追跡ファイルだけ。サブも含む）
# ⚠️ 名前そのものをここに書くとそれ自体が混入になるので whoami で引く
git grep -nI --recurse-submodules -e "$(whoami)" -e '/Users/[A-Za-z]' \
  | grep -vE '/Users/(you|<)'
# → 何も出なければ OK
```

- push 済みで混入が分かったら、まず該当リソースの無効化・ローテーション（履歴の書き換えだけでは足りない）。
- ⚠️ 既存のファイルを別のリポジトリへ移す・写すときも検査する。

## 8. `.memory/` の運用

会話が切れても失われないよう、いまの状況を書き出す。書くのは AI で、指示を待たずに最新に保つ。

| ファイル | 中身 | 消えるとき |
|---|---|---|
| [.memory/issues.md](.memory/issues.md) | 論点（判断が要ること）。優先度（高/中/低）つき | 決めたら「決着した論点」へ |
| [.memory/todo.md](.memory/todo.md) | 作業（やることが明確なこと） | やったら「完了したもの」へ |

- セッションの最初に両方を読み、判明した時点で書く（「あとでまとめて」にしない）。セッションの終わりに実態とのずれを見直す。
- 1行1文で書く。経緯・実測値は書かず、何をやるか／何を決めたかと参照先だけ。
- 「決めること」と「やること」を混ぜない（論点の決着で作業が生まれたら todo に足す）。
- 「次にやる」は3件程度まで。やらないと決めたものは消す。「完了したもの」「決着した論点」は消さない。
- ⚠️ 参照は `.memory/` → 成果物の一方通行。docs・adr から `.memory/` を参照しない（各 README の手順は例外）。道具の都合で成果物を変えない。進捗を `AGENTS.md` に書き足さない。

## 9. 共通の落とし穴

- ⚠️ リージョンが用途で分かれている。Backend（SAM）は東京、Agent（AgentCore）は us-east-1。混同すると動かない（契約 UC-2）。
- IaC は Backend が SAM、Agent が CDK（`agentcore` CLI の仕様）。混同しない。
- ⚠️ デプロイと実機での確認はユーザーが行う。AI は実行しない。`git push`（タグを含む）もユーザーが行う。
- ⚠️ Agent・Backend の `main` への push は本番（dev）のデプロイになる。
- リソースの命名は `<リソースタイプ>-trg-<env>-<識別子>`（契約 UC-1）。

## 10. スコープ

やらないことは [docs/00_user_stories.md](docs/00_user_stories.md) §5（iOS・ナビ機能・複数ユーザー対応・凝った UI 等）。

- メモ機能（US-X.01）は将来必要だが今は作らない。後から `@tool` を足すだけで入れられる構造は保つ。
- 会話の継続は「一問一答＋α」まで。AgentCore Memory は使わない。走行ログのような記録は、会話の記憶ではなく DB 連携として別に設計する。
