import { useCallback, useState } from "react";
import { Linking, View } from "react-native";
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";

import { Alert, Badge, ChoiceRow, Header, ListGroup, ListRow, Screen, SectionHeader, T, Toggle } from "@/components/ui";
import { ABOUT, CYC_CONTACT } from "@/lib/content";
import { forgetPlace, locateMe, locationPermission } from "@/lib/location";

const VISIBILITY = [
  { key: "everyone", title: "Everyone in CYC", sub: "Any member can see your profile" },
  { key: "chapter", title: "My chapter only", sub: "Only members of your chapter" },
  { key: "nobody", title: "Only me", sub: "Hide your profile from other members" },
];

/** Privacy (Figma: Settings – Privacy). */
export default function Privacy() {
  const [loc, setLoc] = useState(false);
  useFocusEffect(
    useCallback(() => {
      void locationPermission().then(setLoc);
    }, []),
  );

  const toggleLocation = async (on: boolean) => {
    if (on) {
      const place = await locateMe().catch(() => null);
      if (!place) {
        // Permission was refused before: only the phone's settings can turn it back on.
        void Linking.openSettings().catch(() => undefined);
      }
      setLoc(Boolean(place));
    } else {
      await forgetPlace();
      setLoc(false);
      const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
      if (perm?.granted) void Linking.openSettings().catch(() => undefined);
    }
  };

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Privacy" />

      <SectionHeader title="Who can see my profile" style={{ marginTop: 4 }} />
      <View style={{ gap: 8, opacity: 0.6 }}>
        {VISIBILITY.map((v) => (
          <ChoiceRow key={v.key} title={v.title} subtitle={v.sub} selected={v.key === "everyone"} onPress={() => undefined} />
        ))}
      </View>
      <View style={{ marginTop: 10, flexDirection: "row" }}>
        <Badge label="Coming soon" />
      </View>
      <T variant="bodySmall" muted style={{ marginTop: 8 }}>
        For now, members can see your name, photo, bio, chapter and department. Your email and phone are only visible to your chapter coordinator and CYC admins.
      </T>

      <SectionHeader title="Location" />
      <ListGroup>
        <ListRow icon="map-pin" iconCircle label="Location access" sublabel="Shows chapters and events near you" chevron={false} right={<Toggle value={loc} onChange={toggleLocation} label="Location access" />} />
      </ListGroup>

      <SectionHeader title="Your data" />
      <ListGroup>
        <ListRow icon="file-text" iconCircle label="Privacy policy" onPress={() => (ABOUT.privacyPolicyUrl ? Linking.openURL(ABOUT.privacyPolicyUrl) : Linking.openURL(`mailto:${CYC_CONTACT.email}?subject=Privacy%20policy`))} />
        <ListRow icon="mail" iconCircle label="Ask about my data" sublabel={CYC_CONTACT.email} onPress={() => Linking.openURL(`mailto:${CYC_CONTACT.email}?subject=My%20data`)} />
      </ListGroup>
      <View style={{ marginTop: 16 }}>
        <Alert text="To delete your account, go to Profile → Account → Delete account." />
      </View>
    </Screen>
  );
}
