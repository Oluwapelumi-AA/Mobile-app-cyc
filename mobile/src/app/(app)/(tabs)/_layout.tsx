import { Tabs } from "expo-router/tabs";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MiniPlayer } from "@/components/MiniPlayer";
import { Icon, IconName, T } from "@/components/ui";
import { useTheme } from "@/lib/theme";

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: "index", label: "Home", icon: "home" },
  { name: "learn", label: "Learn", icon: "school" },
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
          backgroundColor: t.tabBar,
          paddingBottom: Math.max(insets.bottom, 10),
          paddingTop: 12,
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
              <View style={{ width: 64, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: focused ? t.tabActive : "transparent" }}>
                <Icon name={tab.icon} size={22} color={focused ? t.c.onSecondaryContainer : t.textMuted} weight={focused ? "fill" : "regular"} />
              </View>
              <T variant="labelMedium" weight={focused ? "bold" : "medium"} color={focused ? t.text : t.textMuted} style={{ letterSpacing: 0 }}>
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
