# Playへの配信をCI/CDに乗せる（調査）

> 調査: 2026-09-13
> 前提: **内部テストでの配信は成立済み**（[adr/009](../../adr/009_play_internal_testing_release.md)・App v1.35.0）
> ⚠️ **手動での初回アップロードは完了済み**なので、**APIで更新できる状態にある**

## なぜやるのか

⚠️ **走行テストで課題が見つかったとき、すぐに更新を配れないと困る。**

**いまは1回の更新に、手元で以下を全部やる必要がある:**

1. `App/app.json` の `version` を上げる
2. `npm run bundle:play`（⚠️ **4〜5分**）
3. Play Console を開いてAABをドラッグ
4. リリースノートを書いて公開

📌 **`adr/009` D では「更新頻度は低い」という前提で手動を選んだ**が、
⚠️ **実際に走ってみると、課題を見つけてから直して配るまでの往復が要る**と分かった。
**前提が崩れたので見直す。**

> 📌 **「初回が手動なのはAPIの制約であって、方針ではない。」**
> ⚠️ **2回目以降は自動化できるなら、そうするのが当然。**

## ⚠️ 前提知識

⚠️ **ストアのAPI・サービスアカウント・GitHub Actions が何者かを知らない場合は、
先に [learning/15](../../learning/15_app_release_automation.md) を読むこと。**
📌 **本ディレクトリは「このプロジェクトでどう決めるか」だけを扱う。**

| 知りたいこと | どこ |
|---|---|
| **配信を自動化するとはどういうことか** | [learning/15](../../learning/15_app_release_automation.md) |
| **署名・AAB・`versionCode`** | [learning/14](../../learning/14_android_app_signing_and_release.md) |
| **そもそもなぜPlayの内部テストなのか** | [learning/13](../../learning/13_private_app_distribution.md)・[adr/009](../../adr/009_play_internal_testing_release.md) |

## ⚠️ まだ決まっていない

**このディレクトリは検討中。** ⚠️ **決まったら [adr/009](../../adr/009_play_internal_testing_release.md) を改訂する。**

| 論点 | 状態 |
|---|---|
| **① どのツールで上げるか** | ⚠️ **未決**（[COMPARISON.md](COMPARISON.md)） |
| **② ⚠️ 署名をどこでやるか**（鍵をCIに置くか） | ⚠️ **未決**（[COMPARISON.md](COMPARISON.md) §3）。⚠️ **`adr/009` C の見直しを含む** |
| **③ 何を引き金にするか**（push / タグ / 手動） | ⚠️ **未決**（[COMPARISON.md](COMPARISON.md) §4） |

## ファイル

| ファイル | 中身 |
|---|---|
| **README.md**（本書） | **なぜやるか・何が未決か** |
| [COMPARISON.md](COMPARISON.md) | ⚠️ **選択肢の比較**（①〜③の材料） |
| [SETUP.md](SETUP.md) | **共通して必要になる準備**（サービスアカウント等） |

## 📌 決まっていること（前提として動かさない）

- ⚠️ **AWS の CodeBuild には入れない**（[adr/009](../../adr/009_play_internal_testing_release.md) D）。
  **`buildspec.yml` は「`App/` は Expo で出すのでここには無い」方針**であり、
  ⚠️ **Androidのビルド環境をCodeBuildに用意するのは割に合わない。**
  📌 **アプリ側をAWSに依存させない**方針とも整合する。
- ⚠️ **本番公開はしない。** **内部テストのトラックにだけ上げる。**
- ⚠️ **`versionCode` は `app.json` の `version` から導出される**
  （`App/plugins/withVersionCode.js`）。**自動化してもここは変わらない。**

## 次の一手

⚠️ **[COMPARISON.md](COMPARISON.md) を読んで ①〜③ を決める。** 決めてから実装する。
