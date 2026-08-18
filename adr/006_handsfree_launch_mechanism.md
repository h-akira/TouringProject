# 006. ハンズフリー起動は `VOICE_COMMAND` の intent-filter で受ける

- **日付**: 2026-08-17
- **ステータス**: 採用（一部改訂）
- **現在の設計**: 実装は `App/plugins/withVoiceInteraction.js`。詳細な実測は
  [pre-research/handsfree/FINDINGS.md](../pre-research/handsfree/FINDINGS.md) §9

## 背景

US-2.04（ハンズフリー起動）の方式は前日（2026-08-16）の調査で「方式B」
（`VoiceInteractionService` でAndroidの既定アシスタントになる）に決着し、
実装フェーズに入った（[pre-research/handsfree/DECISION.md](../pre-research/handsfree/DECISION.md)）。

`VoiceInteractionService` + `VoiceInteractionSessionService` を実装し、
実機で「デジタルアシスタントアプリ」の候補に出すところまでは想定どおり進んだ
（`recognitionService` 属性が必須という追加の発見はあったが、想定の範囲内）。

⚠️ **しかし、実機でインカムのボタンを押しても、既定のアシスタントに設定した本アプリではなく、
常に Google App の画面（またはアシスタント選択ダイアログ）が開いた。** Alexaを既定にしても同じ挙動。

## 分かったこと（実測）

`adb logcat` でボタン押下時のログを追ったところ、インカムのボタンは
**`android.intent.action.VOICE_COMMAND` という別のIntentを、Bluetoothスタック
（`com.android.bluetooth`, uid 1002）が発行している**ことが判明した。

AOSP標準の実装（`HeadsetSystemInterface.activateVoiceRecognition()`。
[android.googlesource.com](https://android.googlesource.com/platform/packages/apps/Bluetooth/+/refs/heads/main/src/com/android/bluetooth/hfp/HeadsetSystemInterface.java)
で確認）:

```java
public boolean activateVoiceRecognition() {
    Intent intent = new Intent(Intent.ACTION_VOICE_COMMAND);
    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    mHeadsetService.startActivity(intent);
}
```

**これは `VoiceInteractionService`（既定アシスタントRole）とは別の経路。**
`ACTION_VOICE_COMMAND` はコンポーネント名を指定しない汎用Intentで、
これを処理できる **Activityのintent-filter** を持つアプリだけが候補になる。

実機を調べると、`android.intent.action.VOICE_COMMAND` を処理できるActivityとして
Google App（`HandsFreeActivity`）とAmazon Alexa（`VoiceCommandActivity`）が登録されていた。
**本アプリにはこのintent-filterが無かった**ため、選択の候補にすら出ていなかった。

さらに、端末には `android.intent.action.VOICE_COMMAND` に対する
**`preferred activity`（＝常にこれを使う）としてGoogle Appが固定登録**されていたため、
Alexaが候補としてあっても常に無視されていた
（`設定 > アプリ > Google > デフォルトをクリア` で解除できる。ユーザーの実機操作で確認）。

## 決定

**`VoiceInteractionService` 関連の実装は削除し、`MainActivity` に
`android.intent.action.VOICE_COMMAND` のintent-filterを追加する方式に変更する。**

```xml
<intent-filter>
  <action android:name="android.intent.action.VOICE_COMMAND" />
  <category android:name="android.intent.category.DEFAULT" />
</intent-filter>
```

`MainActivity.kt` 側では、`intent.action == Intent.ACTION_VOICE_COMMAND` を検知したら
`app:///?autoRecord=1` の deep link に読み替えて `expo-linking`（`useURL`）に渡す
（`onCreate` と `onNewIntent` の両方で。`launchMode="singleTask"` のため
アプリの起動状態によってどちらが呼ばれるか変わる）。

**「起動経路をつなぐだけ」という当初の方針は変わらない**（[pre-research/handsfree/README.md](../pre-research/handsfree/README.md)）。
変わったのは「どのAndroid APIで起動を受けるか」だけで、
録音・送信・再生といったアプリ本体の処理は一切変更していない。

### ⚠️ `VoiceInteractionService`（既定アシスタントRole）は不要と判明

**この覆りにより、`VoiceInteractionService` の実装は完全に不要になった。**
`android.intent.action.VOICE_COMMAND` はAndroidの標準Intentで、
既定アシスタントのRoleを持たないアプリでも intent-filter だけで受けられる。

⚠️ **ただし「デジタルアシスタントアプリ」に設定する操作自体は無関係ではなかった**
という点は要注意（下記「影響」）。

## 影響

- ✅ **Google Assistant を明け渡す代償は変わらず有効。**
  実機の挙動から、`VOICE_COMMAND` の解決も結局「どのアプリがアシスタント関連の
  既定として選ばれているか」に影響される（`preferred activity` の存在）。
  完全に無関係というわけではなく、**既定を切り替える操作は依然として必要**。
- ⚠️ **実装がシンプルになった。** `VoiceInteractionService` +
  `VoiceInteractionSessionService` + `res/xml` のメタデータ + `recognitionService` の
  実機依存値、といった一式が丸ごと不要になり、`MainActivity` への
  intent-filter 1つと `onCreate`/`onNewIntent` の数行で完結する。
- ⚠️ **マップアプリの上に本アプリが被さる。** `FLAG_ACTIVITY_NEW_TASK` で新規タスクとして
  起動されるため、地図アプリを前面に出していても本アプリに切り替わる
  （Google Assistant起動時も同様の挙動なので、Androidの仕様上の制約）。
- 📌 **`recognitionService` の実測値**（Google Recognition Serviceのコンポーネント名）は
  今回不要になったが、`VoiceInteractionService` を将来また使う場面があれば
  [FINDINGS.md](../pre-research/handsfree/FINDINGS.md) §9 に記録が残っている。
- 📌 **録音の終了は無音検知（VAD）で解決した**（2026-08-18）。
  起動と対になる「終了」も画面操作が要らなくなり、US-2.04は実装として一巡した。
  騒音でマイクが埋まった場合は**送らずに端末内蔵TTSで知らせる**
  （⚠️ Pollyは使わない。通信できない場面でこそ鳴らしたいため）。
  ⚠️ **ただし閾値が走行中に成立するかは未検証**
  （[FINDINGS.md](../pre-research/handsfree/FINDINGS.md) §10〜11）。
