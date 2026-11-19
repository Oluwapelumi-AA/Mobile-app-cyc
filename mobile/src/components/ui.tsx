import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ComponentProps, ReactNode, useState } from "react";
import {
  ActivityIndicator,
  DimensionValue,
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

import { brand, fonts, radius, Theme, Tint, useTheme } from "@/lib/theme";

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

type FeatherName = ComponentProps<typeof Feather>["name"];
type McName = ComponentProps<typeof MaterialCommunityIcons>["name"];
/** Feather names, or "mc:<name>" for MaterialCommunityIcons. */
export type IconName = FeatherName | `mc:${McName}`;

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  const c = color ?? t.text;
  if (typeof name === "string" && name.startsWith("mc:")) {
    return <MaterialCommunityIcons name={name.slice(3) as McName} size={size} color={c} />;
  }
  return <Feather name={name as FeatherName} size={size} color={c} />;
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

const variants = {
  display: { fontFamily: fonts.heavy, fontSize: 44, lineHeight: 46, letterSpacing: -1.2 },
  h1: { fontFamily: fonts.heavy, fontSize: 30, lineHeight: 34, letterSpacing: -0.6 },
  h2: { fontFamily: fonts.heavy, fontSize: 24, lineHeight: 28, letterSpacing: -0.4 },
  h3: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 23, letterSpacing: -0.2 },
  title: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 11.5, lineHeight: 15 },
  overline: { fontFamily: fonts.bold, fontSize: 10.5, lineHeight: 14, letterSpacing: 0.6 },
} as const;

export type TVariant = keyof typeof variants;

export function T({
  variant = "body",
  color,
  muted,
  weight,
  center,
  style,
  ...rest
}: TextProps & {
  variant?: TVariant;
  color?: string;
  muted?: boolean;
  weight?: keyof typeof fonts;
  center?: boolean;
}) {
  const t = useTheme();
  return (
    <Text
      {...rest}
      style={[
        variants[variant],
        { color: color ?? (muted ? t.textMuted : t.text) },
        weight ? { fontFamily: fonts[weight] } : null,
        center ? { textAlign: "center" } : null,
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
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: ("top" | "bottom" | "left" | "right")[];
  padded?: boolean;
  bg?: string;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const pad = padded ? { paddingHorizontal: 18 } : null;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: bg ?? t.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, { paddingBottom: 32 }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={t.primary} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
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
  size = 40,
  label,
  bordered,
}: {
  icon: IconName;
  onPress?: () => void;
  bg?: string;
  color?: string;
  size?: number;
  label: string;
  bordered?: boolean;
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
          backgroundColor: bg ?? "transparent",
          opacity: pressed ? 0.6 : 1,
        },
        bordered ? { borderWidth: 1, borderColor: t.border } : null,
      ]}
    >
      <Icon name={icon} size={size * 0.5} color={color} />
    </Pressable>
  );
}

/** Back arrow + big title, as in the designs. */
export function Header({
  title,
  subtitle,
  back = true,
  right,
  onBack,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <View style={{ paddingTop: 8, paddingBottom: 12 }}>
      <Row gap={6} style={{ justifyContent: "space-between" }}>
        <Row gap={6} style={{ flex: 1 }}>
          {back ? (
            <View style={{ marginLeft: -8 }}>
              <IconButton
                icon="arrow-left"
                label="Back"
                onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")))}
              />
            </View>
          ) : null}
          {title ? (
            <T variant="h1" style={{ flexShrink: 1 }} numberOfLines={1}>
              {title}
            </T>
          ) : null}
        </Row>
        {right}
      </Row>
      {subtitle ? (
        <T variant="small" muted style={{ marginTop: 2 }}>
          {subtitle}
        </T>
      ) : null}
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <Row style={{ justifyContent: "space-between", marginTop: 26, marginBottom: 12 }}>
      <T variant="h3">{title}</T>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <T variant="small" weight="bold" color={t.primary}>
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

type ButtonVariant = "primary" | "gold" | "outline" | "outlineLight" | "light" | "soft" | "dark";

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
    primary: { bg: t.primary, fg: t.onPrimary },
    gold: { bg: brand.gold, fg: "#2A1D00" },
    outline: { bg: "transparent", fg: t.text, border: t.border },
    outlineLight: { bg: "transparent", fg: "#FFFFFF", border: "rgba(255,255,255,0.75)" },
    light: { bg: "#FFFFFF", fg: brand.red },
    soft: { bg: t.tints.yellow.bg, fg: t.tints.yellow.fg },
    dark: { bg: "#10200F", fg: "#FFFFFF" },
  };
  const l = look[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        {
          height: small ? 36 : 50,
          paddingHorizontal: small ? 16 : 22,
          borderRadius: radius.pill,
          backgroundColor: l.bg,
          borderWidth: l.border ? 1 : 0,
          borderColor: l.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: off ? 0.55 : pressed ? 0.85 : 1,
          alignSelf: full ? "stretch" : "flex-start",
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={l.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={small ? 14 : 17} color={l.fg} /> : null}
          <T variant={small ? "small" : "title"} weight={small ? "semibold" : "semibold"} color={l.fg}>
            {label}
          </T>
        </>
      )}
    </Pressable>
  );
}

export function TextButton({ label, onPress, color }: { label: string; onPress?: () => void; color?: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <T variant="small" weight="semibold" color={color ?? t.primary}>
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
    backgroundColor: bg ?? t.surface,
    borderRadius: radius.lg,
    borderWidth: bordered ? 1 : 0,
    borderColor: t.border,
    padding: 14,
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
}: {
  size: number;
  color: string;
  top?: DimensionValue;
  right?: DimensionValue;
  left?: DimensionValue;
  bottom?: DimensionValue;
}) {
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: color, top, right, left, bottom }}
    />
  );
}

export function IconTile({ icon, tint = "yellow", size = 44, rounded = 12 }: { icon: IconName; tint?: Tint; size?: number; rounded?: number }) {
  const t = useTheme();
  const c = t.tints[tint];
  return (
    <View style={{ width: size, height: size, borderRadius: rounded, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={size * 0.46} color={c.fg} />
    </View>
  );
}

export function DateBadge({ iso, tint = "yellow", size = 48 }: { iso: string; tint?: Tint; size?: number }) {
  const t = useTheme();
  const d = new Date(iso);
  const c = t.tints[tint];
  const month = d.toLocaleString("en", { month: "short" }).toUpperCase();
  return (
    <View style={{ width: size, height: size + 4, borderRadius: 12, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
      <T variant="overline" color={c.fg} style={{ fontSize: 10 }}>
        {month}
      </T>
      <T variant="h3" color={c.fg} style={{ fontSize: 20, lineHeight: 22 }}>
        {d.getDate()}
      </T>
    </View>
  );
}

export function Badge({ label, tint = "green", icon }: { label: string; tint?: Tint; icon?: IconName }) {
  const t = useTheme();
  const c = t.tints[tint];
  return (
    <Row gap={4} style={{ backgroundColor: c.bg, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4, alignSelf: "flex-start" }}>
      {icon ? <Icon name={icon} size={12} color={c.fg} /> : null}
      <T variant="caption" weight="semibold" color={c.fg}>
        {label}
      </T>
    </Row>
  );
}

export function Avatar({ name, size = 40, tint = "pink" }: { name: string; size?: number; tint?: Tint }) {
  const t = useTheme();
  const c = t.tints[tint];
  const init = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
      <T variant="h3" color={c.fg} style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }}>
        {init || "?"}
      </T>
    </View>
  );
}

export function ProgressBar({ value, color, track, height = 6 }: { value: number; color?: string; track?: string; height?: number }) {
  const t = useTheme();
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track ?? t.surfaceAlt, overflow: "hidden" }}>
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height, borderRadius: height, backgroundColor: color ?? t.primary }} />
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
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: "red" | "yellow";
  icon?: IconName;
  onRemove?: () => void;
}) {
  const t = useTheme();
  const sel = tone === "red" ? { bg: t.primary, fg: "#FFFFFF" } : { bg: t.tints.yellow.bg, fg: t.tints.yellow.fg };
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 36,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        borderWidth: selected ? 0 : 1,
        borderColor: t.border,
        backgroundColor: selected ? sel.bg : t.bg,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon ? <Icon name={icon} size={14} color={selected ? sel.fg : t.text} /> : null}
      <T variant="small" weight={selected ? "semibold" : "medium"} color={selected ? sel.fg : t.text}>
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 18 }} style={{ flexGrow: 0 }}>
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
  options: { key: K; label: string }[];
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: t.surfaceAlt, borderRadius: radius.pill, padding: 4 }}>
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
              height: 38,
              borderRadius: radius.pill,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? (t.scheme === "dark" ? t.surface : "#FFFFFF") : "transparent",
            }}
          >
            <T variant="small" weight={on ? "semibold" : "medium"} muted={!on}>
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

export function ListGroup({ children }: { children: ReactNode }) {
  const t = useTheme();
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View style={{ backgroundColor: t.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: t.border, overflow: "hidden" }}>
      {items.map((child, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border } : null}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function ListRow({
  icon,
  label,
  sublabel,
  value,
  onPress,
  right,
  danger,
  chevron = true,
}: {
  icon?: IconName;
  label: string;
  sublabel?: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
  chevron?: boolean;
}) {
  const t = useTheme();
  const color = danger ? t.danger : t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: sublabel ? 12 : 15,
        backgroundColor: pressed ? t.surfaceAlt : "transparent",
      })}
    >
      {icon ? <Icon name={icon} size={19} color={danger ? t.danger : t.textMuted} /> : null}
      <View style={{ flex: 1 }}>
        <T variant="body" color={color}>
          {label}
        </T>
        {sublabel ? (
          <T variant="caption" muted>
            {sublabel}
          </T>
        ) : null}
      </View>
      {value ? (
        <T variant="small" muted>
          {value}
        </T>
      ) : null}
      {right}
      {onPress && chevron && !right ? <Icon name="chevron-right" size={18} color={t.textMuted} /> : null}
    </Pressable>
  );
}

export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      trackColor={{ false: t.surfaceAlt, true: t.primary }}
      thumbColor="#FFFFFF"
      {...({ activeThumbColor: "#FFFFFF" } as object)}
      ios_backgroundColor={t.surfaceAlt}
    />
  );
}

/** Hide the browser focus ring in the web preview (fields show their own). */
const noOutline = (Platform.OS === "web" ? { outlineStyle: "none" } : {}) as object;

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  icon,
  secure,
  error,
  ...input
}: TextInputProps & { label: string; icon?: IconName; secure?: boolean; error?: string }) {
  const t = useTheme();
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          minHeight: 58,
          borderRadius: radius.pill,
          borderWidth: focused ? 1.5 : 1,
          borderColor: error ? t.danger : focused ? t.primary : t.border,
          paddingHorizontal: 18,
          backgroundColor: t.bg,
        }}
      >
        {icon ? <Icon name={icon} size={18} color={t.textMuted} /> : null}
        <View style={{ flex: 1, paddingVertical: 8 }}>
          <T variant="caption" muted>
            {label}
          </T>
          <TextInput
            placeholderTextColor={t.textMuted}
            secureTextEntry={secure && hidden}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            {...input}
            style={[{ fontFamily: fonts.medium, fontSize: 16, color: t.text, padding: 0, marginTop: 2 }, noOutline, input.multiline ? { minHeight: 70, textAlignVertical: "top" } : null]}
          />
        </View>
        {secure ? (
          <IconButton icon={hidden ? "eye" : "eye-off"} label={hidden ? "Show password" : "Hide password"} size={34} onPress={() => setHidden((h) => !h)} />
        ) : null}
      </View>
      {error ? (
        <T variant="caption" color={t.danger} style={{ marginTop: 4, marginLeft: 18 }}>
          {error}
        </T>
      ) : null}
    </View>
  );
}

export function SearchBox({
  value,
  onChangeText,
  placeholder,
  onSubmit,
  autoFocus,
  onPress,
}: {
  value?: string;
  onChangeText?: (s: string) => void;
  placeholder: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  onPress?: () => void;
}) {
  const t = useTheme();
  const box: ViewStyle = {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 46,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: t.primary,
    backgroundColor: t.surfaceAlt,
    paddingHorizontal: 14,
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={box}>
        <Icon name="search" size={18} color={t.textMuted} />
        <T variant="small" muted>
          {placeholder}
        </T>
      </Pressable>
    );
  }
  return (
    <View style={box}>
      <Icon name="search" size={18} color={t.text} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.textMuted}
        autoFocus={autoFocus}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        autoCorrect={false}
        style={[{ flex: 1, fontFamily: fonts.medium, fontSize: 15, color: t.text, padding: 0 }, noOutline]}
      />
      {value ? <IconButton icon="x" label="Clear search" size={30} onPress={() => onChangeText?.("")} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export function Loading({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: 48, alignItems: "center", gap: 10 }}>
      <ActivityIndicator color={t.primary} />
      {label ? (
        <T variant="small" muted>
          {label}
        </T>
      ) : null}
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <Card style={{ marginVertical: 12, alignItems: "center", gap: 10, paddingVertical: 20 }} bg={t.tints.pink.bg} bordered={false}>
      <Icon name="alert-circle" size={22} color={t.tints.pink.fg} />
      <T variant="small" center color={t.tints.pink.fg}>
        {message}
      </T>
      {onRetry ? <Button label="Try again" small full={false} variant="outline" onPress={onRetry} /> : null}
    </Card>
  );
}

export function EmptyState({
  icon,
  tint = "green",
  title,
  text,
  action,
  onAction,
}: {
  icon: IconName;
  tint?: Tint;
  title: string;
  text?: string;
  action?: string;
  onAction?: () => void;
}) {
  const t = useTheme();
  const c = t.tints[tint];
  return (
    <View style={{ alignItems: "center", paddingVertical: 40, paddingHorizontal: 12, gap: 10 }}>
      <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
        <Icon name={icon} size={38} color={t.text} />
        <Blob size={14} color={brand.gold} top={4} right={6} />
      </View>
      <T variant="h2" center>
        {title}
      </T>
      {text ? (
        <T variant="small" muted center style={{ maxWidth: 300 }}>
          {text}
        </T>
      ) : null}
      {action ? <Button label={action} small full={false} variant="outline" onPress={onAction} style={{ marginTop: 8, alignSelf: "center" }} /> : null}
    </View>
  );
}

export function Divider({ theme }: { theme?: Theme }) {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: (theme ?? t).border, marginVertical: 12 }} />;
}
