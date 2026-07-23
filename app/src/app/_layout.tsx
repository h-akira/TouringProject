import { Stack } from "expo-router";
import { useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";

// Once the app's JS has loaded, hide the splash screen.
// Without this, the splash (configured in app.json) can stay on screen.
export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return <Stack />;
}
