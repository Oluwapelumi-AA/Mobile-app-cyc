import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";

import { useAccountGate } from "@/components/AccountGate";
import { LiveCard, notify, SermonRow, tintFor, toggleBookmark, toggleRegistration, where } from "@/components/cards";
import { NotificationPrompt } from "@/components/NotificationPrompt";
import {
  Avatar,
  Blob,
  Button,
  Card,
  DateBadge,
  ErrorView,
  HeroTag,
  Icon,
  IconButton,
  IconName,
  IconTile,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  Skeleton,
  Snackbar,
  T,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { takeFlash } from "@/lib/flash";
import { dayDateUpper, duration, plural, time } from "@/lib/format";
import { useInterestGroups } from "@/lib/groups";
import { local } from "@/lib/storage";
import { brand, radius, Tint, useTheme } from "@/lib/theme";
import type { Course, CourseDetail, EventItem, Home as HomeData, Page, Resource } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const crest = require("../../../../assets/cyc-crest.png");

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning," : h < 17 ? "Good afternoon," : "Good evening,";
};

/** Shortcut circle (Figma: "My groups circles"). */
function Bubble({ label, icon, ring, tint, dot, dashed, onPress }: { label: string; icon: IconName; ring?: string; tint?: Tint; dot?: boolean; dashed?: boolean; onPress: () => void }) {
  const t = useTheme();
  const c = tint ? t.tints[tint] : { bg: "transparent", fg: t.text };
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ alignItems: "center", gap: 6, width: 76 }}>
      <View style={{ width: 68, height: 68, borderRadius: 34, borderWidth: dashed ? 1.5 : 3, borderColor: ring ?? t.c.outline, borderStyle: dashed ? "dashed" : "solid", padding: dashed ? 0 : 3 }}>
        <View style={{ flex: 1, borderRadius: 30, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={24} color={c.fg} weight={dashed ? "regular" : "fill"} />
        </View>
        {dot ? <View style={{ position: "absolute", top: 0, right: 2, width: 13, height: 13, borderRadius: 7, backgroundColor: brand.maroon, borderWidth: 2, borderColor: t.bg }} /> : null}
      </View>
      <T variant="bodySmall" numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}

function Greeting({ name, unread, guest }: { name: string; unread?: number; guest?: boolean }) {
  const t = useTheme();
  const { profile } = useAuth();
  return (
    <Row style={{ justifyContent: "space-between", paddingTop: 16, paddingBottom: 20 }}>
      <Row gap={12} style={{ flex: 1 }}>
        {guest ? <Image source={crest} style={{ width: 44, height: 48 }} resizeMode="contain" /> : <Avatar name={name || "?"} size={48} uri={profile?.avatar_url} />}
        <View style={{ flex: 1 }}>
          <T variant="bodyMedium" muted>
            {guest ? "Welcome to CYC" : greeting()}
          </T>
          <T variant="headlineSmall" numberOfLines={1}>
            {guest ? "Have a look around" : `${name} 👋`}
          </T>
        </View>
      </Row>
      <Row gap={8}>
        <IconButton icon="search" label="Search" tonal onPress={() => router.push("/search")} />
        {!guest ? (
          <View>
            <IconButton icon="bell" label={unread ? `Notifications, ${unread} new` : "Notifications"} tonal onPress={() => router.push("/notifications")} />
            {unread ? <View style={{ position: "absolute", top: 8, right: 9, width: 9, height: 9, borderRadius: 5, backgroundColor: brand.maroon, borderWidth: 1.5, borderColor: t.c.surfaceContainerHigh }} /> : null}
          </View>
        ) : null}
      </Row>
    </Row>
  );
}

function HomeSkeleton() {
  return (
    <View style={{ gap: 16 }} accessibilityLabel="Loading">
      <Row gap={12}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} w={68} h={68} r={34} />
        ))}
      </Row>
      <Skeleton h={230} r={28} />
      <Skeleton h={110} r={28} />
      <Row gap={12}>
        <Skeleton h={170} r={20} style={{ flex: 1 }} />
        <Skeleton h={170} r={20} style={{ flex: 1 }} />
      </Row>
    </View>
  );
}

/** The "Next up" maroon card. */
function NextUp({ event, onChange }: { event: EventItem; onChange: (e: EventItem) => void }) {
  const [busy, setBusy] = useState(false);
  const going = async () => {
    setBusy(true);
    try {
      onChange(await toggleRegistration(event));
    } catch (err) {
      notify("Couldn't update", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable onPress={() => router.push(`/event/${event.id}`)} accessibilityRole="button">
      <View style={{ backgroundColor: brand.maroon, borderRadius: radius.xxl, padding: 20, overflow: "hidden", gap: 10, shadowColor: "#990000", shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 }}>
        <Blob size={170} color={brand.gold} top={-75} right={30} />
        <Blob size={32} color={brand.green} top={72} right={44} />
        <HeroTag label={`NEXT UP · ${dayDateUpper(event.starts_at)}`} />
        <T variant="headlineLarge" color="#FFFFFF" numberOfLines={2} style={{ paddingRight: 60 }}>
          {event.title}
        </T>
        <Row gap={8}>
          <Icon name="clock" size={18} color="#FFFFFF" />
          <T variant="bodyLarge" color="#FFFFFF">
            {time(new Date(event.starts_at))}
            {where(event) ? ` · ${where(event)}` : ""}
          </T>
        </Row>
        <Row style={{ justifyContent: "space-between", marginTop: 8 }}>
          <Row gap={0}>
            {["#C89830", "#019933", "#FFDAD4"].map((c, i) => (
              <View key={c} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c, borderWidth: 2, borderColor: brand.maroon, marginLeft: i ? -8 : 0 }} />
            ))}
            <T variant="bodyMedium" color="#FFFFFF" style={{ marginLeft: 8 }}>
              {event.registered_count} going
            </T>
          </Row>
          <Button
            label={event.my_registration === "registered" ? "You're going" : event.my_registration === "waitlisted" ? "On waitlist" : "I'm going"}
            icon={event.my_registration ? "check" : undefined}
            variant="light"
            full={false}
            loading={busy}
            onPress={going}
          />
        </Row>
      </View>
    </Pressable>
  );
}

function KeepLearning({ course }: { course: CourseDetail }) {
  const t = useTheme();
  const done = course.lessons.filter((l) => l.completed).length;
  const next = course.lessons.find((l) => !l.completed);
  return (
    <Pressable onPress={() => router.push(`/course/${course.id}`)} accessibilityRole="button">
      <View style={{ backgroundColor: t.learnCard, borderRadius: radius.xxl, padding: 20, gap: 8 }}>
        <T variant="labelMedium" color={t.learnCardFg}>
          KEEP LEARNING · LESSON {Math.min(done + 1, course.lesson_count)} OF {course.lesson_count}
        </T>
        <Row style={{ gap: 14 }}>
          <View style={{ flex: 1, gap: 8 }}>
            <T variant="titleLarge" color={t.learnCardFg} numberOfLines={1} style={{ fontFamily: "PlusJakartaSans_700Bold" }}>
              {course.title}
            </T>
            <ProgressBar value={course.lesson_count ? (done / course.lesson_count) * 100 : 0} color={t.scheme === "dark" ? t.c.secondary : "#7B5800"} track="rgba(0,0,0,0.12)" />
            <T variant="bodySmall" color={t.learnCardFg}>
              {next?.duration_minutes ? `About ${next.duration_minutes} min left` : `${done} of ${course.lesson_count} lessons done`}
            </T>
          </View>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: t.scheme === "dark" ? t.c.secondary : "#7B5800", alignItems: "center", justifyContent: "center" }}>
            <Icon name="play" size={22} color={t.scheme === "dark" ? t.c.onSecondary : "#FFFFFF"} />
          </View>
        </Row>
      </View>
    </Pressable>
  );
}

function ColourTile({ tint, icon, overline, title, text, onPress, link }: { tint: Tint; icon: IconName; overline: string; title: string; text: string; onPress: () => void; link?: string }) {
  const t = useTheme();
  const c = t.tints[tint];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flex: 1, backgroundColor: c.bg, borderRadius: radius.xl, padding: 16, minHeight: 184 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.fg, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={20} color={c.bg} weight="fill" />
      </View>
      <View style={{ flex: 1 }} />
      <T variant="labelMedium" color={c.fg}>
        {overline}
      </T>
      <T variant="titleMedium" color={c.fg} numberOfLines={2} style={{ fontFamily: "PlusJakartaSans_700Bold" }}>
        {title}
      </T>
      <T variant="bodySmall" color={c.fg} numberOfLines={3}>
        {text}
        {link ? (
          <T variant="bodySmall" color={c.fg} underline style={{ fontFamily: "PlusJakartaSans_600SemiBold" }}>
            {" "}
            {link}
          </T>
        ) : null}
      </T>
    </Pressable>
  );
}

/** Home for visitors without an account (Figma: Guest Home). */
function GuestHome() {
  const t = useTheme();
  const gate = useAccountGate();
  const q = useApi(async () => {
    const [sermons, events, courses] = await Promise.all([
      api<Page<Resource>>("/resources", { query: { limit: 4 } }),
      api<Page<EventItem>>("/events", { query: { limit: 6 } }),
      api<Page<Course>>("/courses", { query: { limit: 3 } }).catch(() => ({ items: [] as Course[], next_cursor: null })),
    ]);
    return { sermons: sermons.items, events: events.items, courses: courses.items };
  });
  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Greeting name="" guest />
      <Card bg={t.c.primaryContainer} bordered={false} style={{ gap: 12, padding: 20 }}>
        <Row gap={12}>
          <IconTile icon="sparkle" tint="red" size={44} />
          <T variant="titleMedium" color={t.c.onPrimaryContainer} style={{ flex: 1 }}>
            You&apos;re browsing as a guest
          </T>
        </Row>
        <T variant="bodyMedium" color={t.c.onPrimaryContainer}>
          A free account lets you join your chapter, save sermons, take courses and earn certificates.
        </T>
        <Button label="Create a free account" onPress={() => gate()} />
      </Card>

      <Row gap={12} style={{ marginTop: 16 }}>
        <ColourTile tint="green" icon="map" overline="CHAPTERS" title="Find a chapter" text="See where CYC meets near you." onPress={() => router.push("/find-chapter")} />
        <ColourTile tint="pink" icon="headphones" overline="SERMONS" title="Listen and watch" text="Messages from across CYC." onPress={() => router.push("/learn/sermons")} />
      </Row>

      {q.loading ? <View style={{ marginTop: 16 }}><HomeSkeleton /></View> : null}
      {q.error && !q.data ? <ErrorView message={q.error} onRetry={q.reload} title="We couldn't load this" /> : null}

      {q.data?.events.length ? (
        <>
          <SectionHeader title="Coming up in CYC" action="See all" onAction={() => router.push("/events")} />
          <EventsStrip events={q.data.events} />
        </>
      ) : null}
      {q.data?.sermons.length ? (
        <>
          <SectionHeader title="Featured sermons" action="See all" onAction={() => router.push("/learn/sermons")} />
          <View style={{ gap: 10 }}>
            {q.data.sermons.map((r) => (
              <SermonRow key={r.id} item={r} onBookmark={() => gate({ title: "Create an account to save sermons", text: "Saved sermons are kept in your account, so they're there on any phone." })} />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function EventsStrip({ events }: { events: EventItem[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }} style={{ marginRight: -20 }}>
      {events.slice(0, 8).map((e, i) => (
        <Card key={e.id} onPress={() => router.push(`/event/${e.id}`)} style={{ width: 232, gap: 12 }}>
          <DateBadge iso={e.starts_at} tint={(["yellow", "green", "pink"] as const)[i % 3]} />
          <T variant="titleMedium" numberOfLines={1}>
            {e.title}
          </T>
          <T variant="bodySmall" muted numberOfLines={2}>
            {new Date(e.starts_at).toLocaleString("en", { weekday: "short", day: "numeric", month: "short" })} · {time(new Date(e.starts_at))}
            {where(e) ? ` · ${where(e)}` : ""}
          </T>
        </Card>
      ))}
    </ScrollView>
  );
}

type Bundle = { home: HomeData; course: CourseDetail | null; starter: Course | null };

export default function Home() {
  const { isGuest } = useAuth();
  return isGuest ? <GuestHome /> : <MemberHome />;
}

function MemberHome() {
  const t = useTheme();
  const { profile } = useAuth();
  const groups = useInterestGroups();
  const [snack, setSnack] = useState<string | null>(null);
  const [hideInvite, setHideInvite] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const m = takeFlash();
      if (m) setSnack(m);
      local.getJSON<boolean>("cyc.hideInterestInvite", false).then(setHideInvite);
    }, []),
  );

  const q = useApi<Bundle>(async () => {
    const home = await api<HomeData>("/me/home");
    const first = home.continue_learning.find((c) => !c.completed_at);
    const [course, starters] = await Promise.all([
      first ? api<CourseDetail>(`/courses/${first.id}`).catch(() => null) : Promise.resolve(null),
      first ? Promise.resolve(null) : api<Page<Course>>("/courses", { query: { limit: 1 } }).catch(() => null),
    ]);
    return { home, course, starter: starters?.items[0] ?? null };
  });

  const data = q.data;
  const home = data?.home;
  const m = home?.membership;
  const firstName = profile?.display_name.split(" ")[0] ?? "";
  const live = home?.live_now[0];
  const next = home?.upcoming_events.find((e) => e.status === "scheduled");
  const later = home?.upcoming_events.filter((e) => e.id !== next?.id) ?? [];
  const featured = home?.new_resources.find((r) => r.kind === "audio" || r.kind === "video");
  const setEvent = (e: EventItem) => q.setData((d) => ({ ...d!, home: { ...d!.home, upcoming_events: d!.home.upcoming_events.map((x) => (x.id === e.id ? e : x)) } }));

  const bookmark = async (r: Resource) => {
    try {
      const u = await toggleBookmark(r);
      q.setData((d) => ({ ...d!, home: { ...d!.home, new_resources: d!.home.new_resources.map((x) => (x.id === r.id ? u : x)) } }));
    } catch (err) {
      notify("Couldn't save", (err as Error).message);
    }
  };

  // No chapter yet (Figma: Home – No chapter).
  if (home && !m?.chapter_id) {
    return (
      <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
        <Greeting name={firstName} unread={home.unread_notifications} />
        <View style={{ backgroundColor: brand.forest, borderRadius: radius.xxl, padding: 20, overflow: "hidden", gap: 10 }}>
          <Blob size={160} color={t.c.secondaryContainer} right={-60} top={-50} />
          <HeroTag label="FIRST STEP" />
          <T variant="headlineSmall" color="#FFFFFF" style={{ paddingRight: 60 }}>
            Find your chapter
          </T>
          <T variant="bodyMedium" color="#FFFFFF">
            Your chapter shapes what you see here: events, news and the people you&apos;ll meet.
          </T>
          <Button label="Find a chapter near me" icon="map-pin" variant="light" full={false} onPress={() => router.push("/find-chapter")} style={{ marginTop: 6 }} />
        </View>
        {home.new_resources.length ? (
          <>
            <SectionHeader title="While you look" action="See all" onAction={() => router.push("/learn/sermons")} />
            <View style={{ gap: 10 }}>
              {home.new_resources.slice(0, 3).map((r) => (
                <SermonRow key={r.id} item={r} onBookmark={bookmark} />
              ))}
            </View>
          </>
        ) : null}
        {data?.starter ? (
          <Card bg={t.c.tertiaryContainer} bordered={false} onPress={() => router.push(`/course/${data.starter!.id}`)} style={{ marginTop: 16, gap: 6, padding: 20 }}>
            <T variant="labelMedium" color={t.c.onTertiaryContainer}>
              START LEARNING
            </T>
            <T variant="titleLarge" color={t.c.onTertiaryContainer}>
              {data.starter.title}
            </T>
            <T variant="bodySmall" color={t.c.onTertiaryContainer}>
              {plural(data.starter.lesson_count, "lesson")} · at your own pace
            </T>
          </Card>
        ) : null}
        <Snackbar text={snack} onHide={() => setSnack(null)} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
        <Greeting name={firstName} unread={home?.unread_notifications} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }} style={{ marginRight: -20, marginBottom: 24 }}>
          {m?.chapter_id ? <Bubble label="My chapter" icon="users" ring={brand.maroon} tint="pink" dot={(home?.recent_posts.length ?? 0) > 0} onPress={() => router.push(`/chapter/${m.chapter_id}`)} /> : null}
          {m?.department_name ? <Bubble label={m.department_name} icon="users" ring={brand.gold} tint="yellow" onPress={() => router.push("/departments")} /> : null}
          {groups.mine.map((g) => (
            <Bubble key={g.id} label={g.name} icon={g.icon} ring={brand.gold} tint="yellow" onPress={() => router.push({ pathname: "/group/[id]", params: { id: g.id } })} />
          ))}
          <Bubble label="Join" icon="plus" dashed onPress={() => router.push("/interest-groups")} />
        </ScrollView>

        {q.loading ? <HomeSkeleton /> : null}
        {q.error && !data ? <ErrorView message={q.error} onRetry={q.reload} title="We couldn't load your home" /> : null}

        <View style={{ gap: 16 }}>
          {live ? <LiveCard meeting={live} /> : null}
          {next ? <NextUp event={next} onChange={setEvent} /> : null}
          {data?.course ? <KeepLearning course={data.course} /> : null}
        </View>

        {data ? (
          <Row gap={12} style={{ marginTop: 16, alignItems: "stretch" }}>
            <ColourTile
              tint="green"
              icon="users"
              overline="MY CHAPTER"
              title={m?.chapter_name ?? "My chapter"}
              text={home!.recent_posts.length ? `${plural(home!.recent_posts.length, "new update")} from your leaders.` : "News and events from your leaders."}
              link="View all"
              onPress={() => router.push(`/chapter/${m!.chapter_id}`)}
            />
            <ColourTile
              tint="pink"
              icon="play"
              overline="FEATURED SERMON"
              title={featured?.title ?? "Sermons"}
              text={featured ? [featured.author_name, duration(featured.duration_seconds)].filter(Boolean).join(" · ") : "Listen and watch."}
              onPress={() => (featured ? router.push(`/sermon/${featured.id}`) : router.push("/learn/sermons"))}
            />
          </Row>
        ) : null}

        {later.length ? (
          <>
            <SectionHeader title="This month" action="See all" onAction={() => router.push("/events")} />
            <EventsStrip events={later} />
          </>
        ) : null}

        {data ? (
          groups.interests === null ? (
            !hideInvite ? (
              <Card bg={t.c.secondaryContainer} bordered={false} style={{ marginTop: 28, gap: 10, padding: 20 }}>
                <T variant="titleMedium" color={t.c.onSecondaryContainer}>
                  Find your people
                </T>
                <T variant="bodyMedium" color={t.c.onSecondaryContainer}>
                  Tell us what you&apos;re into and we&apos;ll suggest groups to join.
                </T>
                <Row gap={8}>
                  <Button label="Choose interests" small full={false} onPress={() => router.push("/interests")} />
                  <Button
                    label="Not now"
                    small
                    full={false}
                    variant="text"
                    onPress={() => {
                      setHideInvite(true);
                      void local.setJSON("cyc.hideInterestInvite", true);
                    }}
                  />
                </Row>
              </Card>
            ) : null
          ) : groups.suggested.length ? (
            <>
              <SectionHeader title="Groups you might like" action="See all" onAction={() => router.push("/interest-groups")} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }} style={{ marginRight: -20 }}>
                {groups.suggested.map((g, i) => (
                  <Card key={g.id} onPress={() => router.push({ pathname: "/group/[id]", params: { id: g.id } })} style={{ width: 200, gap: 10 }}>
                    <IconTile icon={g.icon} tint={tintFor(i)} size={40} />
                    <T variant="titleMedium">{g.name}</T>
                    <T variant="bodySmall" muted numberOfLines={2} style={{ minHeight: 32 }}>
                      {g.description}
                    </T>
                    <Button
                      label={g.policy === "open" ? "Join" : "Request"}
                      small
                      full={false}
                      variant="outline"
                      onPress={async () => setSnack((await groups.join(g)) === "member" ? `You joined ${g.name}.` : `Request sent to ${g.name}.`)}
                    />
                  </Card>
                ))}
              </ScrollView>
            </>
          ) : null
        ) : null}

        {home?.new_resources.length && !featured ? (
          <>
            <SectionHeader title="New for you" action="See all" onAction={() => router.push("/learn")} />
            <View style={{ gap: 10 }}>
              {home.new_resources.slice(0, 3).map((r) => (
                <SermonRow key={r.id} item={r} onBookmark={bookmark} />
              ))}
            </View>
          </>
        ) : null}
      </Screen>
      <Snackbar text={snack} onHide={() => setSnack(null)} />
      <NotificationPrompt />
    </View>
  );
}
