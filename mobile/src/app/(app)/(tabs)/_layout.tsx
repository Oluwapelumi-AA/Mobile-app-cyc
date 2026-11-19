import { Tabs } from "expo-router/tabs";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MiniPlayer } from "@/components/MiniPlayer";
import { Icon, IconName, T } from "@/components/ui";
import { useTheme } from "@/lib/theme";

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: "index", label: "Home", icon: "home" },
  { name: "learn", label: "Learn", icon: "mc:school-outline" },
  { name: "community", label: "Community", icon: "users" },
  { name: "events", label: "Events", icon: "calendar" },
  { name: "profile", label: "Profile", icon: "user" },
];

type BarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void; emit: (e: { type: "tabPress"; target: string; canPreventDefault: true }) => { defaultPrevented: boolean } };
};

function TabBar({ state, navigation }: BarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: t.bg, paddingTop: 6 }}>
      <MiniPlayer />
      <View
        style={{
          flexDirection: "row",
          backgroundColor: t.scheme === "dark" ? t.surface : "#F1ECE5",
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
        }}
      >
        {state.routes.map((route, i) => {
          const tab = TABS.find((x) => x.name === route.name);
          if (!tab) return null;
          const focused = state.index === i;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              onPress={() => {
                const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
              }}
              style={{ flex: 1, alignItems: "center", gap: 3 }}
            >
              <View style={{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 999, backgroundColor: focused ? t.tabActive : "transparent" }}>
                <Icon name={tab.icon} size={20} color={focused ? t.text : t.textMuted} />
              </View>
              <T variant="caption" weight={focused ? "bold" : "medium"} muted={!focused}>
                {tab.label}
              </T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...(props as unknown as BarProps)} />}>
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}
