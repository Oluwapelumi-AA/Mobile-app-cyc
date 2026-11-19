import Constants from "expo-constants";
import { Image, Linking, View } from "react-native";

import { Card, Header, ListGroup, ListRow, Screen, T } from "@/components/ui";
import { API_URL } from "@/lib/api";
import { brand } from "@/lib/theme";

const crest = require("../../../assets/cyc-crest.png");

export default function About() {
  return (
    <Screen>
      <Header title="About CYC" />
      <Card bg={brand.red} bordered={false} style={{ alignItems: "center", gap: 10, paddingVertical: 28 }}>
        <Image source={crest} style={{ width: 72, height: 72 }} />
        <T variant="h2" color="#FFFFFF">
          CYC
        </T>
        <T variant="small" color="#FFFFFF" center>
          Learn. Connect. Take part.
        </T>
      </Card>
      <T variant="body" muted style={{ marginTop: 16 }}>
        Your digital home in CYC: courses, sermons, events and your chapter, all in one place.
      </T>
      <View style={{ height: 16 }} />
      <ListGroup>
        <ListRow icon="mail" label="Contact us" onPress={() => Linking.openURL("mailto:support@cyc.org")} />
        <ListRow icon="info" label="Version" value={Constants.expoConfig?.version ?? "1.0.0"} chevron={false} />
        {__DEV__ ? <ListRow icon="server" label="Server" sublabel={API_URL} chevron={false} /> : null}
      </ListGroup>
    </Screen>
  );
}
