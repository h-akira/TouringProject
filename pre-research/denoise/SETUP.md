# どう試すか

> 手元で ffmpeg を掛けるための手順。

## 0. 前提: ffmpeg

✅ **確認済み**（2026-09-13・このMac）: `ffmpeg 9.0.1`、
**`arnndn` `afftdn` `anlmdn` `highpass` `speechnorm` すべて利用可能。**

```sh
ffmpeg -hide_banner -filters | grep -E "arnndn|afftdn|anlmdn|highpass"
```

⚠️ **無ければ `brew install ffmpeg`**（RNNoise は本体に同梱されている）。

## 1. ⚠️ サンプルを置く（ユーザー作業）

⚠️ **S3の録音は1日で消える**（`AudioRetentionDays=1`）ので**急ぐこと。**

```sh
cd pre-research/denoise   # ⚠️ リポジトリのルートから

# バケット名は Backend/README.md 参照（⚠️ アカウントIDが入るのでここには書かない）
aws s3 cp s3://<BUCKET>/audio/<requestId>.m4a samples/original/ --profile touring
```

📌 **ファイル名は分かるように付け直す**と後で楽:

```
samples/original/
  old-phone_riding.m4a      ← ⚠️ 古い端末・走行中（本命の検体）
  old-phone_idling.m4a      ← 古い端末・アイドリング
  new-phone_riding.m4a      ← 新しい端末・走行中（比較用）
```

> ⚠️ **`samples/` は gitignore 済み。** 走行中の録音には**居場所と声**が入るため、
> **絶対にコミットしない**（CLAUDE.md「公開リポジトリの鉄則」）。

## 2. 除去を試す

⚠️ **RNNoise にはモデルファイル（`.rnnn`）が要る。**

⚠️ **モデルはリポジトリに入れていない**（`models/` は `.gitignore` 済み）。
📌 **第三者の配布物**であり、**下記で再取得できる**ため。

```sh
# モデルを取る（⚠️ samples/ 配下ではなく models/ に置く）
mkdir -p models
BASE=https://raw.githubusercontent.com/GregorR/rnnoise-models/master

curl -L -o models/std.rnnn $BASE/somnolent-hogwash-2018-09-01/sh.rnnn
curl -L -o models/bd.rnnn  $BASE/beguiling-drafter-2018-08-30/bd.rnnn
curl -L -o models/lq.rnnn  $BASE/leavened-quisling-2018-08-31/lq.rnnn
curl -L -o models/mp.rnnn  $BASE/marathon-prescription-2018-08-29/mp.rnnn
curl -L -o models/cb.rnnn  $BASE/conjoined-burgers-2018-08-28/cb.rnnn
```

📌 **`REPORT.md` §2 の「RNNoise 全モデル」はこの4種（`sh`/`bd`/`lq`/`mp`）を指す。**
⚠️ **いずれも結果は ❌ だった**ので、**追試の必要が無ければ取らなくてよい。**

⚠️ **m4a のまま処理せず、WAVに開いてから掛ける**
（`arnndn` は 48kHz 前提のため⚠️ **リサンプルが要る**）。

```sh
IN=samples/original/old-phone_riding.m4a
mkdir -p samples/processed

# ① highpass のみ（エンジン音は低域寄り）
ffmpeg -y -i "$IN" -af "highpass=f=200" -ar 16000 -ac 1 samples/processed/01_highpass.wav

# ② afftdn（FFTノイズ除去・定常騒音向け）
ffmpeg -y -i "$IN" -af "afftdn=nf=-25" -ar 16000 -ac 1 samples/processed/02_afftdn.wav

# ③ arnndn（RNNoise）⚠️ 48kHzに上げてから掛け、16kHzに戻す
ffmpeg -y -i "$IN" -af "aresample=48000,arnndn=m=models/std.rnnn,aresample=16000" \
  -ac 1 samples/processed/03_rnnoise.wav

# ④ 組み合わせ（highpass → RNNoise → 音量正規化）
ffmpeg -y -i "$IN" \
  -af "highpass=f=200,aresample=48000,arnndn=m=models/std.rnnn,aresample=16000,speechnorm" \
  -ac 1 samples/processed/04_combined.wav
```

📌 `speechnorm` は除去でレベルが落ちるぶんを持ち上げるもの。
