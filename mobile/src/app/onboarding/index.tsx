import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { PickerSheet } from "@/components/Picker";
import { StepHeader } from "@/components/StepIndicator";
import { Alert, Button, Chip, ChoiceRow, EmptyState, Field, IconTile, Loading, Row, Screen, SearchBox, SelectField, T, TextButton } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { setFlash } from "@/lib/flash";
import { INTEREST_GROUPS, saveInterests } from "@/lib/groups";
import { COUNTRIES, countryName, distanceKm, kmLabel, locateMe, Place, savedPlace } from "@/lib/location";
import { useTheme } from "@/lib/theme";
import type { Chapter, Department, OnboardingStatus } from "@/lib/types";

type Step = "location" | "chapter" | "department" | "interests";
const ORDER: Step[] = ["location", "chapter", "department", "interests"];

/**
 * Onboarding steps 2–5 (step 1, Create account, is the sign-up screen):
 * your location → chapter → department → interests → Home.
 */
export default function Onboarding() {
  const t = useTheme();
  const { profile, reload, signOut } = useAuth();
  const [step, setStep] = useState<Step>("location");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Location
  const [place, setPlace] = useState<Place | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState("");
  const [country, setCountry] = useState(profile?.country_code ?? "NG");
  const [city, setCity] = useState(profile?.city ?? "");
  const [picker, setPicker] = useState(false);

  // Chapter
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [query, setQuery] = useState("");
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  // Department and interests
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);

  useEffect(() => {
    savedPlace().then((p) => p && setPlace(p));
  }, []);

  useEffect(() => {
    if (step === "chapter" && chapters === null) api<Chapter[]>("/chapters").then(setChapters).catch((e) => setError(errorText(e)));
    if (step === "department" && departments === null) api<Department[]>("/departments").then(setDepartments).catch((e) => setError(errorText(e)));
  }, [step, chapters, departments]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    const i = ORDER.indexOf(step);
    if (i <= 0 || joined) return;
    setStep(ORDER[i - 1]);
  };

  const useMyLocation = async () => {
    setLocating(true);
    setLocationNote("");
    try {
      const p = await locateMe();
      if (!p) {
        setLocationNote("Location is off. Choose your country and city below instead.");
        return;
      }
      setPlace(p);
      if (p.countryCode) setCountry(p.countryCode);
      if (p.city) setCity(p.city);
    } catch {
      setLocationNote("We couldn't find your location. Choose your country and city below.");
    } finally {
      setLocating(false);
    }
  };

  const saveLocation = () =>
    run(async () => {
      await api("/profiles/me", { method: "PATCH", body: { country_code: country, city: city.trim() || null } });
      setStep("chapter");
    });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (chapters ?? []).filter((c) => c.is_active && (!q || `${c.name} ${c.city ?? ""} ${c.state ?? ""}`.toLowerCase().includes(q)));
    const withKm = list.map((c) => ({ c, km: place ? distanceKm(place, c) : null }));
    return withKm.sort((a, b) => {
      if (a.km != null && b.km != null) return a.km - b.km;
      if (a.km != null) return -1;
      if (b.km != null) return 1;
      const near = (x: Chapter) => (x.country_code === country ? 0 : 1) + (city && x.city?.toLowerCase() === city.toLowerCase() ? -1 : 0);
      return near(a.c) - near(b.c) || a.c.name.localeCompare(b.c.name);
    });
  }, [chapters, query, place, country, city]);

  /** Choose (or skip) a chapter and finish onboarding so membership starts. */
  const finishChapter = (chosen: string | null) =>
    run(async () => {
      if (chosen) await api("/me/chapter", { method: "PUT", body: { chapter_id: chosen } });
      const status = await api<OnboardingStatus>("/onboarding/me");
      if (!status.is_complete) {
        for (const s of status.steps) {
          if (s.status !== "pending") continue;
          if (s.step === "chapter" && chosen) await api("/onboarding/me/steps/chapter/complete", { method: "POST" });
          else if (s.required) await api(`/onboarding/me/steps/${s.step}/complete`, { method: "POST" }).catch(() => undefined);
          else await api(`/onboarding/me/steps/${s.step}/skip`, { method: "POST" });
        }
        await api("/onboarding/me/complete", { method: "POST" });
      }
      setJoined(Boolean(chosen));
      setStep(chosen ? "department" : "interests");
    });

  const saveDepartment = (skip: boolean) =>
    run(async () => {
      if (!skip && departmentId) await api("/me/department", { method: "PUT", body: { department_id: departmentId } });
      setStep("interests");
    });

  const finish = (skip: boolean) =>
    run(async () => {
      if (!skip) await saveInterests(interests);
      setFlash(skip ? "You're all set. Add interests any time from your profile." : "You're all set. Welcome to CYC!");
      await reload();
    });

  const stepNumber = ORDER.indexOf(step) + 2;
  const nearby = shown.some((x) => x.km != null);

  const footer = (() => {
    if (step === "location")
      return <Button label="Continue" onPress={saveLocation} loading={busy} disabled={!country} />;
    if (step === "chapter")
      return (
        <>
          <Button label="Join this chapter" onPress={() => chapterId && finishChapter(chapterId)} disabled={!chapterId} loading={busy && Boolean(chapterId)} />
          <Button label="I can't find my chapter" variant="outline" onPress={() => finishChapter(null)} />
        </>
      );
    if (step === "department")
      return (
        <>
          <Button label={departmentId ? "Join department" : "Continue"} onPress={() => saveDepartment(false)} loading={busy} />
          <Button label="Skip for now" variant="text" onPress={() => saveDepartment(true)} />
        </>
      );
    return (
      <>
        <Button label="Show my home" onPress={() => finish(false)} disabled={!interests.length} loading={busy && interests.length > 0} />
        <Button label="Skip for now" variant="text" onPress={() => finish(true)} />
      </>
    );
  })();

  return (
    <Screen edges={["top", "bottom"]} footer={<View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }}>{footer}</View>}>
      <StepHeader step={stepNumber} onBack={step !== "location" && !joined ? back : undefined} />

      {step === "location" ? (
        <>
          <T variant="headlineMedium" style={{ marginTop: 16 }} accessibilityRole="header">
            Where are you?
          </T>
          <T variant="bodyLarge" muted style={{ marginTop: 4, marginBottom: 20 }}>
            We&apos;ll show chapters and events near you. Location is optional.
          </T>
          <Button label={locating ? "Finding you…" : place ? "Location found" : "Use my location"} icon={place ? "check-circle" : "navigation"} variant={place ? "soft" : "primary"} onPress={useMyLocation} loading={locating} />
          <T variant="bodySmall" muted style={{ marginTop: 8 }}>
            {locationNote || (place ? `Near ${[place.city, place.region].filter(Boolean).join(", ") || "you"}. We only use this to find chapters nearby.` : "We only use your location to find chapters near you. You can turn it off any time.")}
          </T>
          <Row gap={12} style={{ marginVertical: 20 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: t.c.outlineVariant }} />
            <T variant="labelMedium" muted>
              Or choose manually
            </T>
            <View style={{ flex: 1, height: 1, backgroundColor: t.c.outlineVariant }} />
          </Row>
          <SelectField label="Country" icon="globe" value={countryName(country)} onPress={() => setPicker(true)} />
          <Field label="City" icon="map-pin" value={city} onChangeText={setCity} placeholder="Abuja" autoCapitalize="words" />
          <PickerSheet
            visible={picker}
            title="Country"
            searchable
            options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
            selected={country}
            onSelect={setCountry}
            onClose={() => setPicker(false)}
          />
        </>
      ) : null}

      {step === "chapter" ? (
        <>
          <T variant="headlineMedium" style={{ marginTop: 16 }} accessibilityRole="header">
            Choose your chapter
          </T>
          <T variant="bodyLarge" muted style={{ marginTop: 4, marginBottom: 16 }}>
            You&apos;ll be a member straight away. You can only belong to one chapter, so pick the one you attend.
          </T>
          <Row>
            <SearchBox value={query} onChangeText={setQuery} placeholder="Search by chapter name or city" outlined={false} />
          </Row>
          <T variant="titleSmall" muted style={{ marginTop: 16, marginBottom: 12 }}>
            {nearby ? "Near you" : city ? `Chapters near ${city}` : "All chapters"}
          </T>
          {chapters === null && !error ? <Loading /> : null}
          <View style={{ gap: 8 }}>
            {shown.map(({ c, km }) => (
              <ChoiceRow
                key={c.id}
                title={c.name}
                subtitle={[c.city ?? countryName(c.country_code), kmLabel(km)].filter(Boolean).join(" · ")}
                selected={c.id === chapterId}
                onPress={() => setChapterId(c.id === chapterId ? null : c.id)}
                leading={<IconTile icon="church" tint={c.id === chapterId ? "red" : "yellow"} size={40} />}
              />
            ))}
          </View>
          {chapters !== null && !shown.length ? (
            <EmptyState icon="map-pin" tint="yellow" title="No chapters found" text="Try another name or city, or tap “I can't find my chapter” to look around first." />
          ) : null}
        </>
      ) : null}

      {step === "department" ? (
        <>
          <T variant="headlineMedium" style={{ marginTop: 16 }} accessibilityRole="header">
            Join a department
          </T>
          <T variant="bodyLarge" muted style={{ marginTop: 4, marginBottom: 16 }}>
            Departments are how members serve in CYC. Pick one to join now. You can leave or switch to another later.
          </T>
          <T variant="titleSmall" muted style={{ marginBottom: 12 }}>
            Departments
          </T>
          {departments === null && !error ? <Loading /> : null}
          <View style={{ gap: 8 }}>
            {(departments ?? []).map((d, i) => (
              <ChoiceRow
                key={d.id}
                title={d.name}
                subtitle={[d.description, `${d.member_count} ${d.member_count === 1 ? "member" : "members"}`].filter(Boolean).join(" · ")}
                selected={d.id === departmentId}
                onPress={() => setDepartmentId(d.id === departmentId ? null : d.id)}
                leading={<IconTile icon="users" tint={(["yellow", "green", "pink"] as const)[i % 3]} size={40} />}
              />
            ))}
          </View>
          <T variant="bodySmall" muted style={{ marginTop: 12 }}>
            You can be in one department at a time.
          </T>
        </>
      ) : null}

      {step === "interests" ? (
        <>
          <T variant="headlineMedium" style={{ marginTop: 16 }} accessibilityRole="header">
            What are you into?
          </T>
          <T variant="bodyLarge" muted style={{ marginTop: 4, marginBottom: 20 }}>
            Pick a few. We&apos;ll suggest groups and content you&apos;ll enjoy.
          </T>
          <Row gap={8} style={{ flexWrap: "wrap" }}>
            {INTEREST_GROUPS.map((g) => (
              <Chip
                key={g.id}
                label={g.name}
                tone="yellow"
                selected={interests.includes(g.id)}
                onPress={() => setInterests((cur) => (cur.includes(g.id) ? cur.filter((x) => x !== g.id) : [...cur, g.id]))}
              />
            ))}
          </Row>
          <T variant="bodySmall" muted style={{ marginTop: 16 }}>
            {interests.length ? `${interests.length} selected` : "Pick at least one, or skip for now."}
          </T>
        </>
      ) : null}

      {error ? (
        <View style={{ marginTop: 16 }}>
          <Alert tone="error" text={error} />
        </View>
      ) : null}
      {step === "location" ? (
        <View style={{ alignItems: "center", marginTop: 8 }}>
          <TextButton label="Sign out" color={t.textMuted} onPress={signOut} />
        </View>
      ) : null}
    </Screen>
  );
}
