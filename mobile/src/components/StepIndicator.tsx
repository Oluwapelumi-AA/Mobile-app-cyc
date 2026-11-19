import { View } from "react-native";

import { IconButton, Row, T } from "@/components/ui";
import { useTheme } from "@/lib/theme";

/** Onboarding header: back arrow and "Step x of 5" bars (Figma: Step indicator). */
export function StepHeader({ step, total = 5, onBack }: { step: number; total?: number; onBack?: () => void }) {
  const t = useTheme();
  return (
    <Row gap={8} style={{ paddingTop: 8, paddingBottom: 8, minHeight: 56 }}>
      <View style={{ marginLeft: -10, width: 44 }}>{onBack ? <IconButton icon="arrow-left" label="Back" onPress={onBack} /> : null}</View>
      <Row gap={4} style={{ flex: 1 }}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < step ? t.button : t.c.surfaceContainerHighest }} />
        ))}
      </Row>
      <T variant="labelMedium" muted accessibilityLabel={`Step ${step} of ${total}`}>
        {step} of {total}
      </T>
    </Row>
  );
}
