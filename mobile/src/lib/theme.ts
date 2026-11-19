import { TextStyle, useColorScheme } from "react-native";

/**
 * CYC Light design system (Figma "CYC Mobile App"): Material 3 colour roles
 * generated from the logo's maroon, gold and green, in light and dark.
 */

/** Brand colours stay the same in light and dark mode. */
export const brand = {
  maroon: "#990000",
  red: "#990000",
  gold: "#C89830",
  green: "#019933",
  forest: "#2F6A2F",
  white: "#FFFFFF",
};

export type Tint = "yellow" | "green" | "pink" | "gray" | "red";

const lightRoles = {
  primary: "#990000",
  onPrimary: "#FFFFFF",
  primaryContainer: "#FFDAD4",
  onPrimaryContainer: "#410000",
  secondary: "#7B5800",
  onSecondary: "#FFFFFF",
  secondaryContainer: "#FFDEA4",
  onSecondaryContainer: "#261900",
  tertiary: "#1A6B2A",
  tertiaryContainer: "#B5F2B0",
  onTertiaryContainer: "#002105",
  error: "#BA1A1A",
  errorContainer: "#FFDAD6",
  onErrorContainer: "#410002",
  surface: "#FBF9F6",
  surfaceContainerLowest: "#FFFFFF",
  surfaceContainerLow: "#F6F3F0",
  surfaceContainer: "#F0EDEB",
  surfaceContainerHigh: "#EAE8E5",
  surfaceContainerHighest: "#E5E2DF",
  onSurface: "#1D1B19",
  onSurfaceVariant: "#4B4641",
  outline: "#7C7670",
  outlineVariant: "#CCC5BF",
  inverseSurface: "#32302E",
  inverseOnSurface: "#F4F0ED",
  scrim: "rgba(0,0,0,0.45)",
};

const darkRoles: typeof lightRoles = {
  primary: "#FFB4A8",
  onPrimary: "#690000",
  primaryContainer: "#930000",
  onPrimaryContainer: "#FFDAD4",
  secondary: "#F3BE53",
  onSecondary: "#412D00",
  secondaryContainer: "#5D4200",
  onSecondaryContainer: "#FFDEA4",
  tertiary: "#9AD596",
  tertiaryContainer: "#1A5121",
  onTertiaryContainer: "#B5F2B0",
  error: "#FFB4AB",
  errorContainer: "#93000A",
  onErrorContainer: "#FFDAD6",
  surface: "#151311",
  surfaceContainerLowest: "#100E0C",
  surfaceContainerLow: "#1D1B19",
  surfaceContainer: "#211F1D",
  surfaceContainerHigh: "#2B2A28",
  surfaceContainerHighest: "#363432",
  onSurface: "#E5E2DF",
  onSurfaceVariant: "#CCC5BF",
  outline: "#95908A",
  outlineVariant: "#4B4641",
  inverseSurface: "#E5E2DF",
  inverseOnSurface: "#32302E",
  scrim: "rgba(0,0,0,0.6)",
};

function build(scheme: "light" | "dark") {
  const c = scheme === "dark" ? darkRoles : lightRoles;
  return {
    scheme,
    c,
    // Short names used across screens.
    bg: c.surface,
    surface: c.surfaceContainerLow,
    surfaceAlt: c.surfaceContainerHigh,
    border: c.outlineVariant,
    text: c.onSurface,
    textMuted: c.onSurfaceVariant,
    primary: c.primary,
    onPrimary: c.onPrimary,
    /** Filled buttons: maroon in light, light maroon in dark (M3 primary). */
    button: scheme === "dark" ? c.primary : brand.maroon,
    onButton: c.onPrimary,
    accent: brand.gold,
    danger: c.error,
    tabBar: c.surfaceContainer,
    tabActive: c.secondaryContainer,
    tints: {
      yellow: { bg: c.secondaryContainer, fg: c.onSecondaryContainer },
      green: { bg: c.tertiaryContainer, fg: c.onTertiaryContainer },
      pink: { bg: c.primaryContainer, fg: c.onPrimaryContainer },
      gray: { bg: c.surfaceContainerHigh, fg: c.onSurfaceVariant },
      red: { bg: brand.maroon, fg: "#FFFFFF" },
    } as Record<Tint, { bg: string; fg: string }>,
    /** "Keep learning" card. */
    learnCard: c.secondaryContainer,
    learnCardFg: c.onSecondaryContainer,
  };
}

const LIGHT = build("light");
const DARK = build("dark");

export type Theme = ReturnType<typeof build>;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? DARK : LIGHT;
}

/** Two typefaces: Bricolage Grotesque (display, headlines) and Plus Jakarta Sans (everything else). */
export const fonts = {
  brandBold: "BricolageGrotesque_700Bold",
  brandHeavy: "BricolageGrotesque_800ExtraBold",
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  heavy: "PlusJakartaSans_800ExtraBold",
};

/** Material 3 type scale, as named in the Figma file. */
export const type: Record<string, TextStyle> = {
  displayLarge: { fontFamily: fonts.brandHeavy, fontSize: 57, lineHeight: 64, letterSpacing: -1.2 },
  displayMedium: { fontFamily: fonts.brandHeavy, fontSize: 45, lineHeight: 52, letterSpacing: -0.8 },
  displaySmall: { fontFamily: fonts.brandHeavy, fontSize: 36, lineHeight: 44, letterSpacing: -0.6 },
  headlineLarge: { fontFamily: fonts.brandHeavy, fontSize: 32, lineHeight: 40, letterSpacing: -0.6 },
  headlineMedium: { fontFamily: fonts.brandHeavy, fontSize: 28, lineHeight: 36, letterSpacing: -0.4 },
  headlineSmall: { fontFamily: fonts.brandBold, fontSize: 24, lineHeight: 32, letterSpacing: -0.3 },
  section: { fontFamily: fonts.brandBold, fontSize: 20, lineHeight: 28, letterSpacing: -0.2 },
  titleLarge: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28 },
  titleMedium: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24 },
  titleSmall: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  bodyLarge: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  bodySmall: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  labelLarge: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, letterSpacing: 0.1 },
  labelMedium: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
  labelSmall: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 16, letterSpacing: 0.5 },
};

/** 4-point spacing scale. */
export const space = { "2xs": 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, "2xl": 32, "3xl": 40, "4xl": 48 };

export const radius = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, pill: 999 };
