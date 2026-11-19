import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { notify } from "@/components/cards";
import { PickerSheet } from "@/components/Picker";
import { Alert, Button, Field, Header, ListGroup, ListRow, Screen, SectionHeader, SelectField, Toggle } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { COUNTRIES, countryName, forgetPlace, locateMe, locationPermission } from "@/lib/location";

/** Location (Figma: Settings – Location). */
export default function LocationSettings() {
  const { profile, reload } = useAuth();
  const [auto, setAuto] = useState(false);
  const [country, setCountry] = useState(profile?.country_code ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void locationPermission().then(setAuto);
    }, []),
  );

  const useMine = async (on: boolean) => {
    if (!on) {
      await forgetPlace();
      setAuto(false);
      return;
    }
    setFinding(true);
    try {
      const place = await locateMe();
      if (!place) return notify("Location is off", "Allow location for CYC in your phone’s settings, or pick your country and city below.");
      setAuto(true);
      if (place.countryCode) setCountry(place.countryCode);
      if (place.city) setCity(place.city);
    } catch (err) {
      notify("Couldn’t find you", errorText(err));
    } finally {
      setFinding(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api("/profiles/me", {
        method: "PATCH",
        body: { city: city.trim() || null, country_code: country || null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      await reload();
      router.back();
    } catch (err) {
      notify("Couldn’t save", errorText(err));
      setBusy(false);
    }
  };

  return (
    <Screen
      edges={["top", "bottom"]}
      footer={
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <Button label="Save" onPress={save} loading={busy} />
        </View>
      }
    >
      <Header title="Location" subtitle="Helps us show chapters and events near you." />
      <ListGroup>
        <ListRow
          icon="crosshair"
          iconCircle
          label="Use my location"
          sublabel={finding ? "Finding you…" : auto ? "On" : "Off"}
          chevron={false}
          right={<Toggle value={auto} onChange={useMine} label="Use my location" disabled={finding} />}
        />
      </ListGroup>

      <SectionHeader title="Or set it yourself" />
      <View style={{ gap: 12 }}>
        <SelectField label="Country" icon="globe" value={countryName(country)} placeholder="Choose a country" onPress={() => setPicking(true)} />
        <Field label="City" icon="map-pin" value={city} onChangeText={setCity} autoCapitalize="words" placeholder="Abuja" />
      </View>
      <Alert text="Your time zone is set from this phone." />

      <PickerSheet
        visible={picking}
        title="Country"
        searchable
        options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
        selected={country}
        onSelect={setCountry}
        onClose={() => setPicking(false)}
      />
    </Screen>
  );
}
