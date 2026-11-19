import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorView,
  Field,
  Icon,
  IconTile,
  Loading,
  ProgressBar,
  Row,
  Screen,
  SearchBox,
  Spacer,
  T,
  TextButton,
} from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { local } from "@/lib/storage";
import { useTheme } from "@/lib/theme";
import type { Chapter, Department, OnboardingStatus } from "@/lib/types";

type Step = "about" | "chapter" | "department";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "pt", label: "Português" },
  { code: "es", label: "Español" },
];

/** Name and language, then a chapter (optional), then a department (optional). */
export default function Onboarding() {
  const t = useTheme();
  const { profile, signOut, reload } = useAuth();
  const [step, setStep] = useState<Step>(profile ? "chapter" : "about");
  const [name, setName] = useState(profile?.display_name ?? "");
  const [language, setLanguage] = useState(profile?.language_code ?? "en");
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [query, setQuery] = useState("");
  const [chapterId, setChapterId] = useState<string | null>(profile?.preferred_chapter_id ?? null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (step === "chapter" && chapters === null) {
      api<Chapter[]>("/chapters").then(setChapters).catch((e) => setError(errorText(e)));
    }
    if (step === "department" && departments === null) {
      api<Department[]>("/departments").then(setDepartments).catch((e) => setError(errorText(e)));
    }
  }, [step, chapters, departments]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (chapters ?? []).filter((c) => c.is_active && (!q || `${c.name} ${c.city ?? ""} ${c.country_code}`.toLowerCase().includes(q)));
  }, [chapters, query]);

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

  const stepDone = (status: OnboardingStatus | null, s: string) =>
    status?.steps.find((x) => x.step === s)?.status !== "pending";

  const saveAbout = () =>
    run(async () => {
      if (!name.trim()) throw new Error("Tell us what to call you.");
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (profile) {
        await api("/profiles/me", { method: "PATCH", body: { display_name: name.trim(), language_code: language, timezone } });
      } else {
        await api("/profiles/me", { method: "POST", body: { display_name: name.trim(), language_code: language, timezone } });
      }
      const status = await api<OnboardingStatus>("/onboarding/me");
      for (const s of ["profile_basics", "language", "timezone"]) {
        if (!stepDone(status, s)) await api(`/onboarding/me/steps/${s}/complete`, { method: "POST" }).catch(() => undefined);
      }
      if (await local.getJSON<boolean>("cyc.guest", false)) return finish(null);
      setStep("chapter");
    });

  /** Pick (or skip) a chapter, skip the other optional steps, and finish onboarding. */
  const finish = (chosen: string | null) =>
    run(async () => {
      if (chosen) await api("/me/chapter", { method: "PUT", body: { chapter_id: chosen } });
      const status = await api<OnboardingStatus>("/onboarding/me");
      if (!status.is_complete) {
        for (const s of status.steps) {
          if (s.status !== "pending") continue;
          if (s.step === "chapter" && chosen) await api(`/onboarding/me/steps/chapter/complete`, { method: "POST" });
          else if (!s.required) await api(`/onboarding/me/steps/${s.step}/skip`, { method: "POST" });
        }
        await api("/onboarding/me/complete", { method: "POST" });
      }
      await local.remove("cyc.guest");
      if (chosen) {
        setJoined(true);
        setStep("department");
      } else {
        await reload();
      }
    });

  // Guests skip the chapter step.
  useEffect(() => {
    local.getJSON<boolean>("cyc.guest", false).then((g) => {
      if (g && profile) void finish(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveDepartment = () =>
    run(async () => {
      if (departmentId) await api("/me/department", { method: "PUT", body: { department_id: departmentId } });
      await reload();
    });

  const progress = step === "about" ? 33 : step === "chapter" ? 66 : 100;

  return (
    <Screen edges={["top", "bottom"]}>
      <Row style={{ justifyContent: "space-between", paddingTop: 12, paddingBottom: 18 }}>
        <View style={{ flex: 1, marginRight: 16 }}>
          <ProgressBar value={progress} />
        </View>
        {step !== "department" ? <TextButton label="Sign out" color={t.textMuted} onPress={signOut} /> : null}
      </Row>

      {step === "about" ? (
        <>
          <T variant="h1">Welcome to CYC</T>
          <T variant="body" muted style={{ marginTop: 4, marginBottom: 22 }}>
            First, what should we call you?
          </T>
          <Field label="Your name" icon="user" value={name} onChangeText={setName} placeholder="Ada Okafor" autoComplete="name" autoCapitalize="words" />
          <T variant="title" style={{ marginTop: 10, marginBottom: 10 }}>
            Language
          </T>
          <Row gap={8} style={{ flexWrap: "wrap" }}>
            {LANGUAGES.map((l) => (
              <Chip key={l.code} label={l.label} selected={language === l.code} onPress={() => setLanguage(l.code)} />
            ))}
          </Row>
          {error ? <ErrorView message={error} /> : null}
          <Spacer h={28} />
          <Button label="Continue" onPress={saveAbout} loading={busy} />
        </>
      ) : null}

      {step === "chapter" ? (
        <>
          <T variant="h1">Choose your chapter</T>
          <T variant="body" muted style={{ marginTop: 4, marginBottom: 16 }}>
            You’ll become a member straight away. You can only belong to one chapter, so choose the one you attend.
          </T>
          <Row>
            <SearchBox value={query} onChangeText={setQuery} placeholder="Search by name or city" />
          </Row>
          <Spacer h={14} />
          {chapters === null && !error ? <Loading /> : null}
          {error ? <ErrorView message={error} /> : null}
          <View style={{ gap: 10 }}>
            {shown.map((c) => {
              const on = c.id === chapterId;
              return (
                <Pressable key={c.id} onPress={() => setChapterId(on ? null : c.id)}>
                  <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, borderColor: on ? t.primary : t.border, borderWidth: on ? 2 : 1 }}>
                    <IconTile icon="mc:church" tint={on ? "red" : "yellow"} />
                    <View style={{ flex: 1 }}>
                      <T variant="title">{c.name}</T>
                      <T variant="caption" muted>
                        {[c.city, c.country_code].filter(Boolean).join(", ")} · {c.member_count} {c.member_count === 1 ? "member" : "members"}
                      </T>
                    </View>
                    <Icon name={on ? "check-circle" : "circle"} size={22} color={on ? t.primary : t.border} />
                  </Card>
                </Pressable>
              );
            })}
            {chapters !== null && shown.length === 0 ? (
              <EmptyState icon="map-pin" tint="yellow" title="No chapters found" text="Try another name or city, or skip for now." />
            ) : null}
          </View>
          <Spacer h={22} />
          <Button label={chapterId ? "Join this chapter" : "Choose a chapter"} disabled={!chapterId} onPress={() => finish(chapterId)} loading={busy} />
          <View style={{ alignItems: "center", marginTop: 16 }}>
            <TextButton label="Skip for now" onPress={() => finish(null)} />
          </View>
        </>
      ) : null}

      {step === "department" ? (
        <>
          <T variant="h1">{joined ? "You're in!" : "Pick a department"}</T>
          <T variant="body" muted style={{ marginTop: 4, marginBottom: 18 }}>
            Want to serve? Join a department. You can change or leave it later.
          </T>
          {departments === null && !error ? <Loading /> : null}
          {error ? <ErrorView message={error} /> : null}
          <Row gap={8} style={{ flexWrap: "wrap" }}>
            {(departments ?? []).map((d) => (
              <Chip key={d.id} label={d.name} icon="users" tone="yellow" selected={d.id === departmentId} onPress={() => setDepartmentId(d.id === departmentId ? null : d.id)} />
            ))}
          </Row>
          <Spacer h={28} />
          <Button label={departmentId ? "Join and continue" : "Continue"} onPress={saveDepartment} loading={busy} />
        </>
      ) : null}
    </Screen>
  );
}
