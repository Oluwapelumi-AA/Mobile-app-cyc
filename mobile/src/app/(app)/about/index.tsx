import Constants from "expo-constants";
import { router } from "expo-router";
import { Image, Linking, View } from "react-native";

import { Blob, Header, ListGroup, ListRow, Screen, SectionHeader, T } from "@/components/ui";
import { API_URL } from "@/lib/api";
import { ABOUT, CYC_CONTACT } from "@/lib/content";
import { brand, radius } from "@/lib/theme";

const crest = require("../../../../assets/cyc-crest.png");

/** About CYC hub (Figma: About CYC). */
export default function About() {
  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="About CYC" />
      <View style={{ backgroundColor: brand.maroon, borderRadius: radius.xxl, padding: 24, overflow: "hidden", alignItems: "center", gap: 10 }}>
        <Blob size={150} color={brand.gold} right={-50} top={-50} />
        <Blob size={80} color="rgba(255,255,255,0.1)" left={-20} bottom={-20} />
        <Image source={crest} style={{ width: 72, height: 80 }} resizeMode="contain" />
        <T variant="headlineSmall" color="#FFFFFF" center>
          Christ Youth Club
        </T>
        <T variant="bodyMedium" color="rgba(255,255,255,0.9)" center>
          {ABOUT.intro}
        </T>
      </View>

      <SectionHeader title="Who we are" />
      <ListGroup>
        <ListRow icon="book-open" iconCircle label={ABOUT.history.title} sublabel={ABOUT.history.lead} onPress={() => router.push("/about/mission")} />
        <ListRow icon="star" iconCircle label="Mission & values" sublabel="What we believe and live by" onPress={() => router.push("/about/mission")} />
        <ListRow icon="building" iconCircle label="Leadership & structure" sublabel="Who leads CYC and how it’s organised" onPress={() => router.push("/about/leadership")} />
        <ListRow icon="music" iconCircle label="CYC Anthem" sublabel="Listen and read the words" onPress={() => router.push("/about/anthem")} />
      </ListGroup>

      <SectionHeader title="Get in touch" />
      <ListGroup>
        <ListRow icon="mail" iconCircle label="Email us" sublabel={CYC_CONTACT.email} onPress={() => Linking.openURL(`mailto:${CYC_CONTACT.email}`)} />
        {ABOUT.termsUrl ? <ListRow icon="file-text" iconCircle label="Terms of use" onPress={() => Linking.openURL(ABOUT.termsUrl!)} /> : null}
        {ABOUT.privacyPolicyUrl ? <ListRow icon="shield" iconCircle label="Privacy policy" onPress={() => Linking.openURL(ABOUT.privacyPolicyUrl!)} /> : null}
        <ListRow icon="info" iconCircle label="App version" value={Constants.expoConfig?.version ?? "1.0.0"} chevron={false} />
        {__DEV__ ? <ListRow icon="server" iconCircle label="Server" sublabel={API_URL} chevron={false} /> : null}
      </ListGroup>
    </Screen>
  );
}
