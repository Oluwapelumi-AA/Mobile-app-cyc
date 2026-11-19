import { useColorScheme } from "react-native";

/** Brand colours from the CYC designs. */
export const brand = {
  red: "#990000",
  redDeep: "#7A0000",
  gold: "#C99A2E",
  green: "#0E9F3E",
  forest: "#2F6A2F",
  white: "#FFFFFF",
};

/** Soft tints used for icon tiles and cards. Each has a light and dark version. */
export type Tint = "yellow" | "green" | "pink" | "gray" | "red";

const light = {
  scheme: "light" as "light" | "dark",
  bg: "#FAF8F3",
  surface: "#F4F0EA",
  surfaceAlt: "#ECE8E1",
  border: "#DAD5CC",
  text: "#1C1A17",
  textMuted: "#6E6A64",
  primary: brand.red,
  onPrimary: "#FFFFFF",
  accent: brand.gold,
  danger: "#B42318",
  tabActive: "#FDDDA0",
  liveCard: brand.red,
  tints: {
    yellow: { bg: "#FFE2A3", fg: "#7A5300" },
    green: { bg: "#BDF2B6", fg: "#1F5A1F" },
    pink: { bg: "#FFD9D4", fg: "#8F0000" },
    gray: { bg: "#E8E4DE", fg: "#4B4740" },
    red: { bg: brand.red, fg: "#FFFFFF" },
  } as Record<Tint, { bg: string; fg: string }>,
  learnCard: "#FDDC93",
  learnCardFg: "#2A2213",
};

const dark: typeof light = {
  scheme: "dark",
  bg: "#121110",
  surface: "#1E1C1A",
  surfaceAlt: "#2A2724",
  border: "#3A3632",
  text: "#F5F2EC",
  textMuted: "#A8A29A",
  primary: "#B3121B",
  onPrimary: "#FFFFFF",
  accent: brand.gold,
  danger: "#FF6B5E",
  tabActive: "#5A4512",
  liveCard: brand.red,
  tints: {
    yellow: { bg: "#5A4512", fg: "#FFD98A" },
    green: { bg: "#1E4A22", fg: "#B8F0B0" },
    pink: { bg: "#7A0F0F", fg: "#FFD3CC" },
    gray: { bg: "#2E2A26", fg: "#D8D2C8" },
    red: { bg: brand.red, fg: "#FFFFFF" },
  },
  learnCard: "#5A4512",
  learnCardFg: "#FFE7B0",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

export const fonts = {
  regular: "BricolageGrotesque_400Regular",
  medium: "BricolageGrotesque_500Medium",
  semibold: "BricolageGrotesque_600SemiBold",
  bold: "BricolageGrotesque_700Bold",
  heavy: "BricolageGrotesque_800ExtraBold",
};

export const radius = { sm: 10, md: 14, lg: 18, xl: 22, pill: 999 };
