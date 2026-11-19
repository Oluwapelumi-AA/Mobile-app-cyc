import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Linking, View } from "react-native";

import { openMap } from "@/components/cards";
import { PickerSheet } from "@/components/Picker";
import { Badge, Button, Card, EmptyState, ErrorView, Header, Icon, IconTile, Loading, Row, Screen, SearchBox, SelectField, T, TextButton } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CYC_CONTACT } from "@/lib/content";
import { countryName, distanceKm, kmLabel, locateMe, locationPermission, Place, savedPlace } from "@/lib/location";
import { useTheme } from "@/lib/theme";
import type { Chapter } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** Find a chapter (Figma: Find a chapter, and the "Location off" version). */
export default function FindChapter() {
  const t = useTheme();
  const { membership } = useAuth();
  const q = useApi(() => api<Chapter[]>("/chapters"));
  const [place, setPlace] = useState<Place | null>(null);
  const [locOn, setLocOn] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [picker, setPicker] = useState<"country" | "state" | "city" | null>(null);

  useEffect(() => {
    (async () => {
      const on = await locationPermission();
      setLocOn(on);
      const p = await savedPlace();
      if (p) {
        setPlace(p);
        if (p.countryCode) setCountry(p.countryCode);
      }
    })();
  }, []);

  const chapters = useMemo(() => (q.data ?? []).filter((c) => c.is_active), [q.data]);
  const countries = [...new Set(chapters.map((c) => c.country_code))];
  const states = [...new Set(chapters.filter((c) => !country || c.country_code === country).map((c) => c.state).filter(Boolean))] as string[];
  const cities = [...new Set(chapters.filter((c) => (!country || c.country_code === country) && (!state || c.state === state)).map((c) => c.city).filter(Boolean))] as string[];

  const shown = useMemo(() => {
    const s = query.trim().toLowerCase();
    return chapters
      .filter((c) => (!country || c.country_code === country) && (!state || c.state === state) && (!city || c.city === city))
      .filter((c) => !s || `${c.name} ${c.city ?? ""} ${c.state ?? ""}`.toLowerCase().includes(s))
      .map((c) => ({ c, km: place ? distanceKm(place, c) : null }))
      .sort((a, b) => (a.c.is_mine ? -1 : b.c.is_mine ? 1 : 0) || (a.km ?? 1e9) - (b.km ?? 1e9) || a.c.name.localeCompare(b.c.name));
  }, [chapters, country, state, city, query, place]);

  const turnOn = async () => {
    const p = await locateMe().catch(() => null);
    if (p) {
      setPlace(p);
      setLocOn(true);
      if (p.countryCode) setCountry(p.countryCode);
    } else {
      Linking.openSettings().catch(() => undefined);
    }
  };

  const heading = place && !state && !city ? "Near you" : state ? `Chapters in ${state}` : city ? `Chapters in ${city}` : country ? `Chapters in ${countryName(country)}` : "All chapters";

  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Header title="Find a chapter" />

      {locOn === false && !place ? (
        <Card bg={t.c.secondaryContainer} bordered={false} style={{ gap: 10, marginBottom: 16 }}>
          <Row gap={12}>
            <Icon name="map-pin" color={t.c.onSecondaryContainer} />
            <T variant="titleMedium" color={t.c.onSecondaryContainer}>
              Location is off
            </T>
          </Row>
          <T variant="bodyMedium" color={t.c.onSecondaryContainer}>
            Choose your country, state and city below, or turn on location to see chapters near you.
          </T>
          <Button label="Turn on location" icon="navigation" small full={false} onPress={turnOn} />
        </Card>
      ) : null}

      <Row>
        <SearchBox value={query} onChangeText={setQuery} placeholder="Search by chapter name or city" outlined={false} />
      </Row>
      <View style={{ height: 16 }} />
      <SelectField label="Country" icon="globe" value={country ? countryName(country) : null} placeholder="Any country" onPress={() => setPicker("country")} />
      <Row gap={12}>
        <View style={{ flex: 1 }}>
          <SelectField label="State or region" value={state} placeholder="Any" onPress={() => setPicker("state")} />
        </View>
        <View style={{ flex: 1 }}>
          <SelectField label="City" value={city} placeholder="Any" onPress={() => setPicker("city")} />
        </View>
      </Row>
      <Row style={{ justifyContent: "space-between", marginTop: 4, marginBottom: 12 }}>
        <T variant="section">{heading}</T>
        <TextButton label="Open map" underline onPress={() => openMap(`CYC chapter ${city ?? state ?? countryName(country) ?? ""}`)} />
      </Row>

      {q.loading ? <Loading /> : null}
      {q.error && !q.data ? <ErrorView message={q.error} onRetry={q.reload} title="We couldn't load chapters" /> : null}
      <View style={{ gap: 10 }}>
        {shown.map(({ c, km }, i) => (
          <Card key={c.id} onPress={() => router.push(`/chapter/${c.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
            <IconTile icon="church" tint={c.is_mine ? "red" : (["yellow", "green", "pink"] as const)[i % 3]} size={44} />
            <View style={{ flex: 1 }}>
              <T variant="titleMedium">{c.name}</T>
              <T variant="bodySmall" muted>
                {[c.city, c.state, kmLabel(km)].filter(Boolean).join(" · ") || countryName(c.country_code)}
              </T>
            </View>
            {c.is_mine ? <Badge label="Your chapter" icon="check" /> : <Icon name="chevron-right" size={18} color={t.textMuted} />}
          </Card>
        ))}
      </View>
      {q.data && !shown.length ? <EmptyState icon="map-pin" tint="yellow" title="No chapters here yet" text="Try another city, or clear the filters." action="Clear filters" onAction={() => (setCountry(null), setState(null), setCity(null), setQuery(""))} /> : null}

      {!membership?.chapter_id ? (
        <View style={{ alignItems: "center", marginTop: 20 }}>
          <TextButton label="I can’t find my chapter" underline onPress={() => Linking.openURL(`mailto:${CYC_CONTACT.email}?subject=I%20can%27t%20find%20my%20CYC%20chapter`)} />
        </View>
      ) : null}

      <PickerSheet
        visible={picker === "country"}
        title="Country"
        options={[{ value: "", label: "Any country" }, ...countries.map((c) => ({ value: c, label: countryName(c) ?? c }))]}
        selected={country ?? ""}
        onSelect={(v) => (setCountry(v || null), setState(null), setCity(null))}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === "state"}
        title="State or region"
        options={[{ value: "", label: "Any" }, ...states.map((s) => ({ value: s, label: s }))]}
        selected={state ?? ""}
        onSelect={(v) => (setState(v || null), setCity(null))}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === "city"}
        title="City"
        searchable
        options={[{ value: "", label: "Any" }, ...cities.map((s) => ({ value: s, label: s }))]}
        selected={city ?? ""}
        onSelect={(v) => setCity(v || null)}
        onClose={() => setPicker(null)}
      />
    </Screen>
  );
}
