import { View } from "react-native";

import { Alert, ChoiceRow, Header, Screen } from "@/components/ui";

/** Language (Figma: Settings – Language). The app is English-only for now. */
export default function Language() {
  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Language" />
      <View style={{ gap: 8 }}>
        <ChoiceRow title="English" subtitle="English" selected onPress={() => undefined} />
      </View>
      <View style={{ marginTop: 16 }}>
        <Alert text="English is the only language for now. We’ll add more as CYC grows." />
      </View>
    </Screen>
  );
}
