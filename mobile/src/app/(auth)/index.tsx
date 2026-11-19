import { router } from "expo-router";
import { Image, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { Blob, Button, Icon, IconName, T, TextButton } from "@/components/ui";
import { brand } from "@/lib/theme";

const crest = require("../../../assets/cyc-crest.png");

function Pill({
  label,
  icon,
  bg,
  fg,
  rotate,
  style,
}: {
  label: string;
  icon: IconName;
  bg: string;
  fg: string;
  rotate: string;
  style: object;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: bg, transform: [{ rotate }] }, style]}>
      <Icon name={icon} size={17} color={fg} />
      <T variant="h3" color={fg} style={{ fontSize: 17 }}>
        {label}
      </T>
    </View>
  );
}

/** First screen: what CYC is, and the way in. */
export default function Welcome() {
  return (
    <View style={{ flex: 1, backgroundColor: brand.red, overflow: "hidden" }}>
      <StatusBar style="light" />
      <Blob size={300} color={brand.gold} top={-150} right={-110} />
      <Blob size={150} color={brand.green} left={-95} bottom={250} />
      <View pointerEvents="none" style={styles.arc} />
      <SafeAreaView style={{ flex: 1, paddingHorizontal: 22 }}>
        <Image source={crest} style={{ width: 30, height: 30, marginTop: 14 }} accessibilityLabel="CYC" />

        <View style={{ marginTop: 36 }}>
          <T variant="display" color="#FFFFFF">
            Learn.
          </T>
          <T variant="display" color="#FFFFFF">
            Connect.
          </T>
          <T variant="display" color={brand.gold}>
            Take part.
          </T>
          <View style={{ position: "absolute", right: 30, top: 58 }}>
            <Icon name="mc:star-four-points" size={30} color="#FFFFFF" />
          </View>
          <T variant="h3" weight="medium" color="#FFFFFF" style={{ marginTop: 18, lineHeight: 25 }}>
            Your digital home in CYC. Courses, events and your chapter – all in one place.
          </T>
        </View>

        <View style={{ flex: 1, minHeight: 190 }}>
          <Pill label="Technology" icon="monitor" bg={brand.gold} fg="#2A1D00" rotate="-4deg" style={{ right: 10, top: 40 }} />
          <Pill label="Music" icon="music" bg="#FFFFFF" fg="#1C1A17" rotate="4deg" style={{ left: 22, top: 70 }} />
          <Pill label="Media" icon="mic" bg={brand.green} fg="#FFFFFF" rotate="-3deg" style={{ left: 16, top: 145 }} />
          <Pill label="Bible study" icon="book-open" bg="#FFFFFF" fg="#1C1A17" rotate="3deg" style={{ right: 26, top: 135 }} />
        </View>

        <View style={{ gap: 12, paddingBottom: 12 }}>
          <Button label="Get started" variant="gold" onPress={() => router.push("/sign-up")} />
          <Button label="I already have an account" variant="outlineLight" onPress={() => router.push("/sign-in")} />
          <View style={{ alignItems: "center", paddingVertical: 10 }}>
            <TextButton label="Continue as guest" color="#FFFFFF" onPress={() => router.push({ pathname: "/sign-up", params: { guest: "1" } })} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  arc: {
    position: "absolute",
    right: -120,
    top: 330,
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.4)",
  },
});
