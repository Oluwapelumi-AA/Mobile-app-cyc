import { router } from "expo-router";
import { useState } from "react";

import { notify } from "@/components/cards";
import { Button, Field, Header, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function Location() {
  const { profile, reload } = useAuth();
  const [city, setCity] = useState(profile?.city ?? "");
  const [country, setCountry] = useState(profile?.country_code ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const code = country.trim().toUpperCase();
    if (code && !/^[A-Z]{2}$/.test(code)) return notify("Use a 2-letter country code", "For example NG for Nigeria or GB for the United Kingdom.");
    setBusy(true);
    try {
      await api("/profiles/me", {
        method: "PATCH",
        body: { city: city.trim() || null, country_code: code || null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      await reload();
      router.back();
    } catch (err) {
      notify("Couldn't save", errorText(err));
      setBusy(false);
    }
  };

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Location" />
      <T variant="small" muted style={{ marginBottom: 18 }}>
        Helps us show events and chapters near you. Your time zone is set from this phone.
      </T>
      <Field label="City" icon="map-pin" value={city} onChangeText={setCity} autoCapitalize="words" placeholder="Abuja" />
      <Field label="Country code" icon="flag" value={country} onChangeText={setCountry} autoCapitalize="characters" maxLength={2} placeholder="NG" />
      <Button label="Save" onPress={save} loading={busy} style={{ marginTop: 10 }} />
    </Screen>
  );
}
