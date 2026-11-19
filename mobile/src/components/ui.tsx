import { router } from "expo-router";
import { ReactNode, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  DimensionValue,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon, IconName } from "@/components/Icon";
import { brand, fonts, radius, Tint, type, useTheme } from "@/lib/theme";

export { Icon };
export type { IconName };

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

export type TVariant = keyof typeof type | "display" | "h1" | "h2" | "h3" | "title" | "body" | "small" | "caption" | "overline";

/** Older short names map onto the Material 3 scale. */
const alias: Record<string, string> = {
  display: "displayMedium",
  h1: "headlineLarge",
  h2: "headlineSmall",
  h3: "section",
  title: "titleMedium",
  body: "bodyLarge",
  small: "bodyMedium",
  caption: "bodySmall",
  overline: "labelMedium",
};

export function T({
  variant = "bodyMedium",
  color,
  muted,
  weight,
  center,
  underline,
  style,
  ...rest
}: TextProps & {
  variant?: TVariant;
  color?: string;
  muted?: boolean;
  weight?: keyof typeof fonts;
  center?: boolean;
  underline?: boolean;
}) {
  const t = useTheme();
  const v = type[alias[variant] ?? variant] ?? type.bodyMedium;
  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={1.6}
      style={[
        v,
        { color: color ?? (muted ? t.textMuted : t.text) },
        weight ? { fontFamily: fonts[weight] } : null,
        center ? { textAlign: "center" } : null,
        underline ? { textDecorationLine: "underline" } : null,
        style,
      ]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  edges = ["top"],
  padded = true,
  bg,
  contentStyle,
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: ("top" | "bottom" | "left" | "right")[];
  padded?: boolean;
  bg?: string;
  contentStyle?: StyleProp<ViewStyle>;
  /** Pinned to the bottom, outside the scroll area (e.g. the main action). */
  footer?: ReactNode;
}) {
  const t = useTheme();
  const pad = padded ? { paddingHorizontal: 20 } : null;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: bg ?? t.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, { paddingBottom: 32 }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={t.primary} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

/** Bottom action area that sits above the home indicator. */
export function Footer({ children, bar }: { children: ReactNode; bar?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 12,
        gap: 10,
        backgroundColor: bar ? t.c.surfaceContainer : t.bg,
        flexDirection: bar ? "row" : "column",
      }}
    >
      {children}
    </View>
  );
}

export function Row({ children, gap = 8, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>{children}</View>;
}

export const Spacer = ({ h = 16 }: { h?: number }) => <View style={{ height: h }} />;

export function IconButton({
  icon,
  onPress,
  bg,
  color,
  size = 44,
  label,
  bordered,
  tonal,
  weight,
}: {
  icon: IconName;
  onPress?: () => void;
  bg?: string;
  color?: string;
  size?: number;
  label: string;
  bordered?: boolean;
  /** Filled grey circle, as in the screen headers. */
  tonal?: boolean;
  weight?: "regular" | "bold" | "fill";
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg ?? (tonal ? t.c.surfaceContainerHigh : "transparent"),
          opacity: pressed ? 0.6 : 1,
        },
        bordered ? { borderWidth: 1, borderColor: t.border } : null,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={color} weight={weight} />
    </Pressable>
  );
}

export const goBack = (fallback = "/") => (router.canGoBack() ? router.back() : router.replace(fallback as never));

/** Big screen title with optional back arrow and actions (Headline / Large). */
export function Header({
  title,
  subtitle,
  back = true,
  right,
  onBack,
  small,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  onBack?: () => void;
  /** Top app bar style: back arrow + Title / Large on one line. */
  small?: boolean;
}) {
  return (
    <View style={{ paddingTop: 12, paddingBottom: 16 }}>
      <Row gap={4} style={{ justifyContent: "space-between", minHeight: 48 }}>
        <Row gap={4} style={{ flex: 1 }}>
          {back ? (
            <View style={{ marginLeft: -10 }}>
              <IconButton icon="arrow-left" label="Back" onPress={onBack ?? (() => goBack())} />
            </View>
          ) : null}
          {title ? (
            <T variant={small ? "titleLarge" : back ? "headlineMedium" : "headlineLarge"} style={{ flexShrink: 1 }} numberOfLines={2}>
              {title}
            </T>
          ) : null}
        </Row>
        {right}
      </Row>
      {subtitle ? (
        <T variant="bodyMedium" muted style={{ marginTop: 4 }}>
          {subtitle}
        </T>
      ) : null}
    </View>
  );
}

export function SectionHeader({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <Row style={[{ justifyContent: "space-between", marginTop: 28, marginBottom: 14 }, style]}>
      <T variant="section">{title}</T>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <T variant="labelLarge" color={t.primary} underline>
            {action}
          </T>
        </Pressable>
      ) : null}
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "gold" | "outline" | "outlineLight" | "light" | "soft" | "dark" | "tonal" | "danger" | "text";

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  small,
  style,
  full = true,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}) {
  const t = useTheme();
  const look: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: t.button, fg: t.onButton },
    gold: { bg: brand.gold, fg: "#2A1D00" },
    outline: { bg: "transparent", fg: t.primary, border: t.c.outline },
    outlineLight: { bg: "transparent", fg: "#FFFFFF", border: "rgba(255,255,255,0.8)" },
    light: { bg: "#FFFFFF", fg: brand.maroon },
    soft: { bg: t.c.secondaryContainer, fg: t.c.onSecondaryContainer },
    tonal: { bg: t.c.surfaceContainerHigh, fg: t.text },
    dark: { bg: t.scheme === "dark" ? t.c.tertiaryContainer : "#10200F", fg: t.scheme === "dark" ? t.c.onTertiaryContainer : "#FFFFFF" },
    danger: { bg: t.c.error, fg: t.scheme === "dark" ? "#690005" : "#FFFFFF" },
    text: { bg: "transparent", fg: t.primary },
  };
  const l = look[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off), busy: Boolean(loading) }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        {
          minHeight: small ? 40 : 48,
          paddingHorizontal: small ? 16 : 24,
          borderRadius: radius.pill,
          backgroundColor: disabled && (variant === "primary" || variant === "gold") ? t.c.surfaceContainerHighest : l.bg,
          borderWidth: l.border ? 1 : 0,
          borderColor: l.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: loading ? 0.7 : pressed ? 0.85 : 1,
          alignSelf: full ? "stretch" : "flex-start",
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={l.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={disabled ? t.textMuted : l.fg} /> : null}
          <T variant="labelLarge" color={disabled && (variant === "primary" || variant === "gold") ? t.textMuted : l.fg}>
            {label}
          </T>
        </>
      )}
    </Pressable>
  );
}

/** Underlined link (Link / Medium). */
export function TextButton({ label, onPress, color, underline = false }: { label: string; onPress?: () => void; color?: string; underline?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="link" style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, minHeight: 32, justifyContent: "center" })}>
      <T variant="labelLarge" color={color ?? t.primary} underline={underline}>
        {label}
      </T>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  onPress,
  style,
  bg,
  bordered = true,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  bg?: string;
  bordered?: boolean;
}) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: bg ?? t.c.surfaceContainerLow,
    borderRadius: radius.xl,
    borderWidth: bordered ? 1 : 0,
    borderColor: t.c.outlineVariant,
    padding: 16,
    overflow: "hidden",
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>
      {children}
    </Pressable>
  );
}

/** Decorative circle, used on hero cards. */
export function Blob({
  size,
  color,
  top,
  right,
  left,
  bottom,
  dashed,
}: {
  size: number;
  color: string;
  top?: DimensionValue;
  right?: DimensionValue;
  left?: DimensionValue;
  bottom?: DimensionValue;
  dashed?: boolean;
}) {
  return (
    <View
      pointerEvents="none"
      style={[
        { position: "absolute", width: size, height: size, borderRadius: size / 2, top, right, left, bottom },
        dashed ? { borderWidth: 2, borderStyle: "dashed", borderColor: color } : { backgroundColor: color },
      ]}
    />
  );
}

/** Round icon on a tinted circle (leading element of rows and tiles). */
export function IconTile({ icon, tint = "yellow", size = 40, rounded, solid }: { icon: IconName; tint?: Tint; size?: number; rounded?: number; solid?: boolean }) {
  const t = useTheme();
  const c = t.tints[tint];
  const bg = solid ? c.fg : c.bg;
  const fg = solid ? c.bg : c.fg;
  return (
    <View style={{ width: size, height: size, borderRadius: rounded ?? size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={Math.round(size * 0.5)} color={fg} />
    </View>
  );
}

export function DateBadge({ iso, tint = "yellow", size = 56, dark }: { iso: string; tint?: Tint; size?: number; dark?: boolean }) {
  const t = useTheme();
  const d = new Date(iso);
  const c = dark ? { bg: "#2A1D00", fg: "#FFDEA4" } : t.tints[tint];
  const month = d.toLocaleString("en", { month: "short" }).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
      <T variant="labelMedium" color={c.fg}>
        {month}
      </T>
      <T variant="headlineSmall" color={c.fg} style={{ lineHeight: 26 }}>
        {d.getDate()}
      </T>
    </View>
  );
}

/** Status chip: "Member", "Going", "Request sent"… */
export function Badge({ label, tint = "green", icon }: { label: string; tint?: Tint; icon?: IconName }) {
  const t = useTheme();
  const c = t.tints[tint];
  return (
    <Row gap={4} style={{ backgroundColor: c.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, alignSelf: "flex-start" }}>
      {icon ? <Icon name={icon} size={14} color={c.fg} /> : null}
      <T variant="labelMedium" color={c.fg} style={{ letterSpacing: 0 }}>
        {label}
      </T>
    </Row>
  );
}

/** Small pill on coloured heroes ("NEXT UP · SAT 14 NOV"). */
export function HeroTag({ label, light, dot }: { label: string; light?: boolean; dot?: string }) {
  return (
    <Row
      gap={6}
      style={{
        backgroundColor: light ? "#FFFFFF" : "rgba(0,0,0,0.22)",
        alignSelf: "flex-start",
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      {dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} /> : null}
      <T variant="labelMedium" color={light ? brand.maroon : "#FFFFFF"}>
        {label}
      </T>
    </Row>
  );
}

export function Avatar({ name, size = 40, tint = "pink", uri }: { name: string; size?: number; tint?: Tint; uri?: string | null }) {
  const t = useTheme();
  const c = t.tints[tint];
  const init = name.trim()[0]?.toUpperCase() ?? "?";
  if (uri) return <Image source={{ uri }} accessibilityLabel={name} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.bg }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
      <T variant="titleMedium" color={c.fg} style={{ fontSize: size * 0.4, lineHeight: size * 0.5, fontFamily: fonts.bold }}>
        {init}
      </T>
    </View>
  );
}

export function ProgressBar({ value, color, track, height = 6 }: { value: number; color?: string; track?: string; height?: number }) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
      style={{ height, borderRadius: height, backgroundColor: track ?? t.c.surfaceContainerHighest, overflow: "hidden" }}
    >
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height, borderRadius: height, backgroundColor: color ?? t.primary }} />
    </View>
  );
}

/** Indeterminate thin progress line ("Signing in…"). */
export function LoadingBar() {
  const t = useTheme();
  const x = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: 1100, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [x]);
  return (
    <View style={{ height: 4, backgroundColor: t.c.primaryContainer, overflow: "hidden" }}>
      <Animated.View
        style={{
          position: "absolute",
          height: 4,
          width: "40%",
          backgroundColor: t.button,
          left: x.interpolate({ inputRange: [0, 1], outputRange: ["-40%", "100%"] }),
        }}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Chips and tabs                                                      */
/* ------------------------------------------------------------------ */

export function Chip({
  label,
  selected,
  onPress,
  tone = "red",
  icon,
  onRemove,
  disabled,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: "red" | "yellow";
  icon?: IconName;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  const sel = tone === "red" ? { bg: t.button, fg: t.onButton } : { bg: t.c.secondaryContainer, fg: t.c.onSecondaryContainer };
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 36,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        borderWidth: selected ? 0 : 1,
        borderColor: t.c.outlineVariant,
        backgroundColor: selected ? sel.bg : "transparent",
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      {selected && tone === "yellow" && !icon ? <Icon name="check" size={16} color={sel.fg} /> : null}
      {icon ? <Icon name={icon} size={16} color={selected ? sel.fg : t.text} /> : null}
      <T variant="labelLarge" color={selected ? sel.fg : t.text}>
        {label}
      </T>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${label}`}>
          <Icon name="x" size={14} color={selected ? sel.fg : t.text} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }} style={{ flexGrow: 0, marginRight: -20 }}>
      {children}
    </ScrollView>
  );
}

export function Segmented<K extends string>({
  value,
  onChange,
  options,
}: {
  value: K;
  onChange: (k: K) => void;
  options: { key: K; label: string; icon?: IconName }[];
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: t.c.surfaceContainerHigh, borderRadius: radius.pill, padding: 4 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{
              flex: 1,
              minHeight: 40,
              borderRadius: radius.pill,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 6,
              paddingHorizontal: 12,
              backgroundColor: on ? t.c.surfaceContainerLowest : "transparent",
            }}
          >
            {o.icon ? <Icon name={o.icon} size={16} color={on ? t.text : t.textMuted} /> : null}
            <T variant="labelLarge" muted={!on}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Lists                                                               */
/* ------------------------------------------------------------------ */

export function ListGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View style={[{ backgroundColor: t.c.surfaceContainerLow, borderRadius: radius.xl, borderWidth: 1, borderColor: t.c.outlineVariant, overflow: "hidden" }, style]}>
      {items.map((child, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: t.c.outlineVariant } : null}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function ListRow({
  icon,
  iconCircle,
  leading,
  label,
  sublabel,
  value,
  onPress,
  right,
  danger,
  chevron = true,
  labelColor,
}: {
  icon?: IconName;
  /** Put the icon on a grey circle (detail pages). */
  iconCircle?: boolean;
  leading?: ReactNode;
  label: string;
  sublabel?: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
  chevron?: boolean;
  labelColor?: string;
}) {
  const t = useTheme();
  const color = labelColor ?? (danger ? t.c.error : t.text);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: sublabel ? 12 : 16,
        minHeight: 56,
        backgroundColor: pressed ? t.c.surfaceContainerHigh : "transparent",
      })}
    >
      {leading}
      {icon ? (
        iconCircle ? (
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.surfaceContainerHigh, alignItems: "center", justifyContent: "center" }}>
            <Icon name={icon} size={20} color={t.textMuted} />
          </View>
        ) : (
          <Icon name={icon} size={22} color={danger ? t.c.error : t.text} />
        )
      ) : null}
      <View style={{ flex: 1 }}>
        <T variant="bodyLarge" color={color} style={sublabel ? { fontFamily: fonts.semibold } : null}>
          {label}
        </T>
        {sublabel ? (
          <T variant="bodySmall" muted>
            {sublabel}
          </T>
        ) : null}
      </View>
      {value ? (
        <T variant="bodyMedium" muted>
          {value}
        </T>
      ) : null}
      {right}
      {onPress && chevron && !right ? <Icon name="chevron-right" size={18} color={t.textMuted} /> : null}
    </Pressable>
  );
}

export function Toggle({ value, onChange, disabled, label }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  const t = useTheme();
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      trackColor={{ false: t.c.surfaceContainerHighest, true: t.button }}
      thumbColor={value ? (t.scheme === "dark" ? t.c.onPrimary : "#FFFFFF") : t.c.outline}
      {...({ activeThumbColor: t.scheme === "dark" ? t.c.onPrimary : "#FFFFFF" } as object)}
      ios_backgroundColor={t.c.surfaceContainerHighest}
    />
  );
}

/** Radio-style selectable row (Figma "Choice row"). */
export function ChoiceRow({
  title,
  subtitle,
  selected,
  onPress,
  leading,
  multi,
  right,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  leading?: ReactNode;
  multi?: boolean;
  right?: ReactNode;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: radius.lg,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? t.button : t.c.outlineVariant,
        backgroundColor: selected ? t.c.primaryContainer : t.c.surfaceContainerLow,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {leading}
      <View style={{ flex: 1 }}>
        <T variant="titleMedium" color={selected ? t.c.onPrimaryContainer : t.text}>
          {title}
        </T>
        {subtitle ? (
          <T variant="bodySmall" color={selected ? t.c.onPrimaryContainer : t.textMuted}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
      {multi ? (
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: selected ? t.button : t.c.outline,
            backgroundColor: selected ? t.button : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {selected ? <Icon name="check" size={14} color={t.onButton} weight="bold" /> : null}
        </View>
      ) : (
        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? t.button : t.c.outline, alignItems: "center", justifyContent: "center" }}>
          {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.button }} /> : null}
        </View>
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

/** Hide the browser focus ring in the web preview (fields show their own). */
const noOutline = (Platform.OS === "web" ? { outlineStyle: "none" } : {}) as object;

export function Field({
  label,
  icon,
  secure,
  error,
  hint,
  prefix,
  right,
  ...input
}: TextInputProps & { label: string; icon?: IconName; secure?: boolean; error?: string; hint?: string; prefix?: string; right?: ReactNode }) {
  const t = useTheme();
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  const locked = input.editable === false;
  return (
    <View style={{ marginBottom: 16 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          minHeight: 56,
          borderRadius: radius.pill,
          borderWidth: focused || error ? 2 : 1,
          borderColor: error ? t.c.error : focused ? t.button : t.c.outline,
          paddingHorizontal: 20,
          backgroundColor: locked ? t.c.surfaceContainer : t.bg,
        }}
      >
        {icon ? <Icon name={icon} size={20} color={error ? t.c.error : t.textMuted} /> : null}
        <View style={{ flex: 1, paddingVertical: 8 }}>
          <T variant="bodySmall" color={error ? t.c.error : t.textMuted}>
            {label}
          </T>
          <Row gap={6}>
            {prefix ? <T variant="bodyLarge">{prefix}</T> : null}
            <TextInput
              placeholderTextColor={t.c.outline}
              secureTextEntry={secure && hidden}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              accessibilityLabel={label}
              {...input}
              style={[
                { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: t.text, padding: 0 },
                noOutline,
                input.multiline ? { minHeight: 72, textAlignVertical: "top" } : null,
              ]}
            />
          </Row>
        </View>
        {error ? <Icon name="alert" size={20} color={t.c.error} /> : null}
        {secure ? <IconButton icon={hidden ? "eye" : "eye-off"} label={hidden ? "Show password" : "Hide password"} size={36} onPress={() => setHidden((h) => !h)} /> : null}
        {right}
      </View>
      {error || hint ? (
        <T variant="bodySmall" color={error ? t.c.error : t.textMuted} style={{ marginTop: 4, marginLeft: 20 }}>
          {error ?? hint}
        </T>
      ) : null}
    </View>
  );
}

/** Tappable field that opens a picker (Country, State, City…). */
export function SelectField({ label, value, placeholder, onPress, icon }: { label: string; value?: string | null; placeholder?: string; onPress: () => void; icon?: IconName }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? placeholder ?? ""}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 56,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: t.c.outline,
        paddingHorizontal: 20,
        marginBottom: 16,
      }}
    >
      {icon ? <Icon name={icon} size={20} color={t.textMuted} /> : null}
      <View style={{ flex: 1, paddingVertical: 8 }}>
        <T variant="bodySmall" muted>
          {label}
        </T>
        <T variant="bodyLarge" color={value ? t.text : t.c.outline}>
          {value ?? placeholder ?? "Choose"}
        </T>
      </View>
      <Icon name="chevron-down" size={18} color={t.textMuted} />
    </Pressable>
  );
}

export function SearchBox({
  value,
  onChangeText,
  placeholder,
  onSubmit,
  autoFocus,
  onPress,
  outlined = true,
}: {
  value?: string;
  onChangeText?: (s: string) => void;
  placeholder: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  onPress?: () => void;
  outlined?: boolean;
}) {
  const t = useTheme();
  const box: ViewStyle = {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 52,
    borderRadius: radius.pill,
    borderWidth: outlined ? 1.5 : 0,
    borderColor: t.button,
    backgroundColor: t.c.surfaceContainerHigh,
    paddingHorizontal: 16,
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={[box, { borderWidth: 0 }]} accessibilityRole="search">
        <Icon name="search" size={20} color={t.textMuted} />
        <T variant="bodyLarge" muted>
          {placeholder}
        </T>
      </Pressable>
    );
  }
  return (
    <View style={box}>
      <Icon name="search" size={20} color={t.text} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.textMuted}
        autoFocus={autoFocus}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        autoCorrect={false}
        accessibilityLabel={placeholder}
        style={[{ flex: 1, fontFamily: fonts.regular, fontSize: 16, color: t.text, padding: 0 }, noOutline]}
      />
      {value ? <IconButton icon="x" label="Clear search" size={32} onPress={() => onChangeText?.("")} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

export function Loading({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: 48, alignItems: "center", gap: 10 }}>
      <ActivityIndicator color={t.primary} />
      {label ? (
        <T variant="bodyMedium" muted>
          {label}
        </T>
      ) : null}
    </View>
  );
}

/** Grey placeholder block for skeleton loading. */
export function Skeleton({ h = 16, w = "100%", r = 8, style }: { h?: number; w?: DimensionValue; r?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const o = useState(() => new Animated.Value(0.5))[0];
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(o, { toValue: 0.5, duration: 700, useNativeDriver: Platform.OS !== "web" }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View style={[{ height: h, width: w, borderRadius: r, backgroundColor: t.c.surfaceContainerHigh, opacity: o }, style]} />;
}

export function ErrorView({ message, onRetry, title = "Something went wrong", code }: { message: string; onRetry?: () => void; title?: string; code?: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: 32, paddingHorizontal: 12, gap: 10 }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: t.c.errorContainer, alignItems: "center", justifyContent: "center" }}>
        <Icon name="wifi-off" size={36} color={t.c.onErrorContainer} />
      </View>
      <T variant="headlineSmall" center>
        {title}
      </T>
      <T variant="bodyMedium" muted center style={{ maxWidth: 300 }}>
        {message}
      </T>
      {onRetry ? <Button label="Try again" icon="refresh" full={false} onPress={onRetry} style={{ alignSelf: "center", marginTop: 6 }} /> : null}
      {code ? (
        <T variant="bodySmall" muted>
          {code}
        </T>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  tint = "green",
  title,
  text,
  action,
  onAction,
  secondary,
  onSecondary,
}: {
  icon: IconName;
  tint?: Tint;
  title: string;
  text?: string;
  action?: string;
  onAction?: () => void;
  secondary?: string;
  onSecondary?: () => void;
}) {
  const t = useTheme();
  const c = t.tints[tint];
  return (
    <View style={{ alignItems: "center", paddingVertical: 40, paddingHorizontal: 12, gap: 10 }}>
      <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
        <Icon name={icon} size={40} color={c.fg} />
        <Blob size={16} color={brand.gold} top={4} right={6} />
      </View>
      <T variant="headlineSmall" center>
        {title}
      </T>
      {text ? (
        <T variant="bodyMedium" muted center style={{ maxWidth: 300 }}>
          {text}
        </T>
      ) : null}
      {action ? <Button label={action} full={false} variant="outline" onPress={onAction} style={{ marginTop: 8, alignSelf: "center" }} /> : null}
      {secondary ? <TextButton label={secondary} onPress={onSecondary} underline /> : null}
    </View>
  );
}

/** Coloured inline message (info, success, warning, error). */
export function Alert({ tone = "info", title, text, icon }: { tone?: "info" | "success" | "warning" | "error"; title?: string; text: string; icon?: IconName }) {
  const t = useTheme();
  const map = {
    info: { bg: t.c.surfaceContainerHigh, fg: t.text, icon: "info" as IconName },
    success: { bg: t.c.tertiaryContainer, fg: t.c.onTertiaryContainer, icon: "check-circle" as IconName },
    warning: { bg: t.c.secondaryContainer, fg: t.c.onSecondaryContainer, icon: "warning" as IconName },
    error: { bg: t.c.errorContainer, fg: t.c.onErrorContainer, icon: "alert" as IconName },
  }[tone];
  return (
    <Row gap={12} style={{ backgroundColor: map.bg, borderRadius: radius.lg, padding: 14, alignItems: "flex-start" }}>
      <Icon name={icon ?? map.icon} size={20} color={map.fg} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? (
          <T variant="titleSmall" color={map.fg}>
            {title}
          </T>
        ) : null}
        <T variant="bodyMedium" color={map.fg}>
          {text}
        </T>
      </View>
    </Row>
  );
}

/** Material 3 basic dialog. */
export function Dialog({
  visible,
  icon,
  title,
  text,
  confirm,
  onConfirm,
  cancel = "Cancel",
  onCancel,
  danger,
  busy,
  children,
}: {
  visible: boolean;
  icon?: IconName;
  title: string;
  text?: string;
  confirm: string;
  onConfirm: () => void;
  cancel?: string;
  onCancel: () => void;
  danger?: boolean;
  busy?: boolean;
  children?: ReactNode;
}) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={{ flex: 1, backgroundColor: t.c.scrim, justifyContent: "center", padding: 28 }} onPress={onCancel} accessibilityLabel="Close">
        <Pressable onPress={() => undefined} style={{ backgroundColor: t.c.surfaceContainerHigh, borderRadius: radius.xxl, padding: 24, gap: 14 }}>
          {icon ? (
            <View style={{ alignItems: "center" }}>
              <Icon name={icon} size={28} color={danger ? t.c.error : t.primary} />
            </View>
          ) : null}
          <T variant="headlineSmall" center={Boolean(icon)}>
            {title}
          </T>
          {text ? (
            <T variant="bodyMedium" muted>
              {text}
            </T>
          ) : null}
          {children}
          <Row gap={8} style={{ justifyContent: "flex-end", marginTop: 6 }}>
            <Button label={cancel} variant="text" full={false} onPress={onCancel} />
            <Button label={confirm} variant={danger ? "danger" : "primary"} full={false} onPress={onConfirm} loading={busy} />
          </Row>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Short message at the bottom of the screen. */
export function Snackbar({ text, onHide, action, onAction }: { text: string | null; onHide: () => void; action?: string; onAction?: () => void }) {
  const t = useTheme();
  useEffect(() => {
    if (!text) return;
    const timer = setTimeout(onHide, 4000);
    return () => clearTimeout(timer);
  }, [text, onHide]);
  if (!text) return null;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, bottom: 16 }}>
      <Row gap={12} style={{ backgroundColor: t.c.inverseSurface, borderRadius: radius.sm, paddingHorizontal: 16, paddingVertical: 14 }}>
        <T variant="bodyMedium" color={t.c.inverseOnSurface} style={{ flex: 1 }}>
          {text}
        </T>
        {action ? (
          <Pressable onPress={onAction}>
            <T variant="labelLarge" color={t.scheme === "dark" ? brand.maroon : "#FFB4A8"}>
              {action}
            </T>
          </Pressable>
        ) : null}
      </Row>
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.outlineVariant, marginVertical: 12 }} />;
}
