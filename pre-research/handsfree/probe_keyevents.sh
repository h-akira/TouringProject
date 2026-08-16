#!/bin/sh
# ------------------------------------------------------------------------------
# インカムのボタンが Android に何を送っているかを観測する。
#
#   使い方: ./probe_keyevents.sh
#
# ⚠️ 配線を誤解しないこと（インカムを Mac に繋ぐのではない）:
#
#     インカム ──Bluetooth──> Android実機 ──USB──> Mac
#     （ボタンを押す）        （イベントを受ける）  （このログを読むだけ）
#
#   前提: ・インカムと Android 実機が Bluetooth 接続されている（普段どおり）
#         ・Android 実機の USB デバッグを有効にし、Mac と USB で繋ぐ
#
# ⚠️ このスクリプトは「アプリで拾えるか」を試すものではない。
#    「そもそも何のイベントが飛んでいるか」を先に確定させるためのもの。
#    ここで何も出なければ、そのボタンは起動には使えない。
# ------------------------------------------------------------------------------
set -eu

if ! command -v adb >/dev/null 2>&1; then
  echo "adb が見つからない。Android Platform Tools を入れること。" >&2
  echo "  brew install --cask android-platform-tools" >&2
  exit 1
fi

if [ -z "$(adb devices | sed -n '2p')" ]; then
  echo "実機が接続されていない。USBデバッグを有効にして接続すること。" >&2
  exit 1
fi

echo "=== 接続中の端末 ==="
adb devices -l
echo

cat <<'EOS'
=== インカムのボタンを順に押して、何が出るか見る ===

M1-S Pro には複数のボタンがある。以下を1つずつ試すこと
（1回押すごとに数秒あけると、どの出力がどの操作か分かりやすい）:

  [本命] Function ボタン  シングルタップ  … アシスタント起動のはず
         Function ボタン  ダブルタップ    … 音楽の再生/停止（メディアキー）
         Volume+          ダブルタップ    … 音楽の再生/停止（メディアキー）
         Volume+          2秒長押し       … 前の曲（メディアキー）
         Volume-          2秒長押し       … 次の曲（メディアキー）

⚠️ さらに、以下の状態でも同じことを試す（走行中の条件に近づける）:
     ・画面を消した状態   ← ここが本番
     ・音楽を再生中       ← 競合するか見る

何も出なければ、そのボタンは Android にイベントを送っていない。
終了は Ctrl-C。
EOS
echo

adb logcat -c

# 観測したいものを絞る:
#   - KEYCODE_*        : メディアキー（MEDIA_PLAY_PAUSE / HEADSETHOOK / VOICE_ASSIST 等）
#   - MediaSession     : どのアプリのセッションへ配送されたか
#   - VOICE_COMMAND    : アシスタント起動のインテント
#   - ACTION_ASSIST    : 同上
adb logcat -v time \
  | grep --line-buffered -E 'KEYCODE_|MediaSession|MediaButton|VOICE_COMMAND|ACTION_ASSIST|VoiceInteraction|dispatchMediaKey'
