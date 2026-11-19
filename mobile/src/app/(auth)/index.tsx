import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Blob, Button, Icon, T, TextButton } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { brand, fonts } from "@/lib/theme";

const crest = require("../../../assets/cyc-crest.png");

function Sticker({ label, bg, fg, rotate, style }: { label: string; bg: string; fg: string; rotate: string; style: object }) {
  return (
    <View style={[styles.sticker, { backgroundColor: bg, transform: [{ rotate }] }, style]}>
      <T variant="titleMedium" color={fg} style={{ fontFamily: fonts.brandBold, fontSize: 18 }}>
        {label}
      </T>
    </View>
  );
}

/** Welcome (Figma: Welcome · Option 2). */
export default function Welcome() {
  const { continueAsGuest } = useAuth();
  return (
    <View style={{ flex: 1, backgroundColor: brand.maroon, overflow: "hidden" }}>
      <StatusBar style="light" />
      <Blob size={280} color={brand.gold} top={-138} right={-90} />
      <Blob size={170} color={brand.green} left={-70} bottom={180} />
      <Blob size={220} color="rgba(255,255,255,0.45)" right={-120} top={420} dashed />
      <SafeAreaView style={{ flex: 1, paddingHorizontal: 20 }}>
        <Image source={crest} style={{ width: 30, height: 32, marginTop: 16 }} accessibilityLabel="CYC" />
        <View style={{ marginTop: 40 }}>
          <T variant="displayMedium" color="#FFFFFF" accessibilityRole="header">
            Learn.{"\n"}Connect.
          </T>
          <T variant="displayMedium" color={brand.gold}>
            Take part.
          </T>
          <View style={{ position: "absolute", right: 30, top: 70 }}>
            <Icon name="sparkle" size={36} color="#FFFFFF" weight="fill" />
          </View>
          <T variant="titleLarge" color="#FFFFFF" style={{ marginTop: 18, fontFamily: fonts.medium, fontSize: 19, lineHeight: 27 }}>
            Your digital home in CYC. Courses, events and your chapter – all in one place.
          </T>
        </View>

        <View style={{ flex: 1, minHeight: 170 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Sticker label="🎵 Music" bg="#FFFFFF" fg="#1D1B19" rotate="5deg" style={{ left: 30, top: 54 }} />
          <Sticker label="💻 Technology" bg={brand.gold} fg="#1D1B19" rotate="-4deg" style={{ right: 16, top: 30 }} />
          <Sticker label="🎤 Media" bg={brand.green} fg="#FFFFFF" rotate="-5deg" style={{ left: 20, top: 128 }} />
          <Sticker label="📖 Bible study" bg="#FFFFFF" fg="#1D1B19" rotate="4deg" style={{ right: 36, top: 112 }} />
        </View>

        <View style={{ gap: 12, paddingBottom: 8 }}>
          <Button label="Get started" variant="gold" onPress={() => router.push("/sign-up")} />
          <Button label="I already have an account" variant="outlineLight" onPress={() => router.push("/sign-in")} />
          <View style={{ alignItems: "center" }}>
            <TextButton label="Continue as guest" color="#FFFFFF" onPress={continueAsGuest} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  sticker: {
    position: "absolute",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
});
