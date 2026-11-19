import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, Row, SearchBox, T } from "@/components/ui";
import { radius, useTheme } from "@/lib/theme";

export type Option = { value: string; label: string; sub?: string };

/** Bottom sheet with a list of choices (country, state, city…). */
export function PickerSheet({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
  searchable,
}: {
  visible: boolean;
  title: string;
  options: Option[];
  selected?: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
  searchable?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.c.scrim, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ backgroundColor: t.c.surfaceContainerLow, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, maxHeight: "80%", paddingBottom: Math.max(insets.bottom, 12) }}>
          <View style={{ alignItems: "center", paddingTop: 10 }}>
            <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: t.c.outline }} />
          </View>
          <T variant="titleLarge" style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 }}>
            {title}
          </T>
          {searchable ? (
            <Row style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
              <SearchBox value={q} onChangeText={setQ} placeholder="Search" outlined={false} />
            </Row>
          ) : null}
          <ScrollView>
            {shown.map((o) => {
              const on = o.value === selected;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    onSelect(o.value);
                    setQ("");
                    onClose();
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 20,
                    minHeight: 52,
                    backgroundColor: pressed ? t.c.surfaceContainerHigh : on ? t.c.secondaryContainer : "transparent",
                  })}
                >
                  <View style={{ flex: 1 }}>
                    <T variant="bodyLarge">{o.label}</T>
                    {o.sub ? (
                      <T variant="bodySmall" muted>
                        {o.sub}
                      </T>
                    ) : null}
                  </View>
                  {on ? <Icon name="check" size={20} color={t.c.onSecondaryContainer} /> : null}
                </Pressable>
              );
            })}
            {!shown.length ? (
              <T variant="bodyMedium" muted style={{ padding: 20 }}>
                Nothing matches.
              </T>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
