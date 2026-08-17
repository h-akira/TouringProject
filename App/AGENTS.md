# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

⚠️ **This project is on SDK 54, and stays there.** SDK 57 does not run in Expo Go.
Do not follow docs for a newer SDK: APIs that read as current there may not exist here.

⚠️ **Testing moved from Expo Go to a Development Build** once US-2.04 needed native
code (`android.intent.action.VOICE_COMMAND` intent-filter, see `adr/006`). The app is
tested on a real Android device running the installed Development Build
(`com.touringproject.app`), connected to `npx expo start`. Native changes require
`npx expo run:android` to rebuild — see `README.md` for the exact commands.

Check `package.json` if in doubt — it is the authority on the version.
