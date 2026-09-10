const { withGradleProperties } = require("@expo/config-plugins");

// ビルドするCPUアーキテクチャを実機のものだけに絞る。
//
// ⚠️ **既定は4種類**（`armeabi-v7a,arm64-v8a,x86,x86_64`）で、
// **1回のビルドで `node_modules` 配下に 14.6GB の `.so` が生成される。**
// うち**実機（Pixel 8a = arm64-v8a）が使うのは1種類だけ**で、
// 残り3種類の約8GBは**毎回作られては使われない。**
//
// 📌 **一度消しても、ビルドすれば戻る**性質のものなので、
// **掃除ではなくここで止める**（`docs/01c` §10）。
//
// ⚠️ **`android/gradle.properties` を直接編集しても無駄。**
// prebuild が作り直すので、config plugin から書く必要がある。
//
// ⚠️ **エミュレータ（x86_64）では動かなくなる。**
// 本プロジェクトは**実機でしか確認しない**方針なので許容する
// （`docs/00_user_stories.md` §5「やらないこと」）。
// 使うことになったら、下の値に `x86_64` を足す。
const ANDROID_ARCHITECTURES = "arm64-v8a";

const withSingleAbi = (config) => {
  return withGradleProperties(config, (config) => {
    const key = "reactNativeArchitectures";
    const entry = config.modResults.find(
      (item) => item.type === "property" && item.key === key,
    );
    if (entry) {
      entry.value = ANDROID_ARCHITECTURES;
    } else {
      config.modResults.push({
        type: "property",
        key,
        value: ANDROID_ARCHITECTURES,
      });
    }
    return config;
  });
};

module.exports = withSingleAbi;
