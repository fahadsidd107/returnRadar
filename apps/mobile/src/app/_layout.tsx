import React, { createContext, useContext, useEffect, useState } from "react";
import { View, useColorScheme } from "react-native";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import {
  PaperProvider,
  MD3LightTheme,
  MD3DarkTheme,
  configureFonts,
} from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ApiProvider } from "../api";
SplashScreen.preventAutoHideAsync().catch(() => {});
export const Appearance = createContext({ dark: false, toggle: () => {} });
export const useAppearance = () => useContext(Appearance);
export default function Layout() {
  const system = useColorScheme();
  const [dark, setDark] = useState(system === "dark");
  const [fontLoaded, fontError] = useFonts({
    Manrope: require("../../assets/fonts/Manrope.ttf"),
  });
  useEffect(() => {
    if (fontLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontLoaded, fontError]);
  const base = dark ? MD3DarkTheme : MD3LightTheme;
  const theme = {
    ...base,
    roundness: 4,
    fonts: configureFonts({ config: { fontFamily: "Manrope" } }),
    colors: {
      ...base.colors,
      primary: "#53E0BA",
      onPrimary: "#102A43",
      secondary: dark ? "#B8C8D2" : "#526577",
      background: dark ? "#091822" : "#F7F8F4",
      surface: dark ? "#102A43" : "#FFFFFF",
      surfaceVariant: dark ? "#19384D" : "#EDF1EE",
      onSurface: dark ? "#F7F8F4" : "#102A43",
      onSurfaceVariant: dark ? "#B8C8D2" : "#526577",
      outline: dark ? "#2B485A" : "#DDE4E7",
      error: dark ? "#FFB4AB" : "#A92D27",
    },
  };
  if (!fontLoaded && !fontError)
    return <View style={{ flex: 1, backgroundColor: "#102A43" }} />;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Appearance.Provider value={{ dark, toggle: () => setDark((v) => !v) }}>
          <PaperProvider theme={theme}>
            <ApiProvider>
              <Stack screenOptions={{ headerShown: false }} />
            </ApiProvider>
          </PaperProvider>
        </Appearance.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
