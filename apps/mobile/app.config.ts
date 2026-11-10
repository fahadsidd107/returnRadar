import type { ExpoConfig } from "expo/config";
const config: ExpoConfig = {
  name: process.env.APP_NAME || "Return Radar",
  slug: process.env.APP_SLUG || "return-radar",
  scheme: process.env.APP_SCHEME || "returnradar",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: process.env.APP_IDENTIFIER || "dev.example.returnradar",
    infoPlist: {
      NSPhotoLibraryUsageDescription:
        "Choose receipt photos and return evidence.",
      NSCameraUsageDescription:
        "Photograph receipts and parcel handover evidence.",
    },
  },
  android: {
    package: process.env.APP_IDENTIFIER || "dev.example.returnradar",
    adaptiveIcon: {
      backgroundColor: "#102A43",
      foregroundImage: "./assets/android-icon-foreground.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
  },
  web: { favicon: "./assets/favicon.png" },
  plugins: [
    "expo-router",
    "expo-font",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#102A43",
        image: "./assets/splash-icon.png",
        imageWidth: 144,
        dark: { backgroundColor: "#102A43", image: "./assets/splash-icon.png" },
      },
    ],
    "expo-secure-store",
    "expo-sqlite",
  ],
  experiments: { typedRoutes: true },
};
export default config;
