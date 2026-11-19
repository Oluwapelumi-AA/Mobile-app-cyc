import { router } from "expo-router";
import { useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";

import { LiveCard, notify, tintFor, toggleRegistration, where } from "@/components/cards";
import {
  Blob,
  Button,
  Card,
  DateBadge,
  ErrorView,
  Icon,
  IconButton,
  IconName,
  IconTile,
  Loading,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  T,
} from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dayDateUpper, duration, plural, time } from "@/lib/format";
import { brand, Tint, useTheme } from "@/lib/theme";
import type { CourseDetail, Department, Home as HomeData } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const crest = require("../../../../assets/cyc-crest.png");

type HomeBundle = { home: HomeData; departments: Department[]; course: CourseDetail | null };

function Bubble({ label, icon, ring, tint, dot, dashed, onPress }: { label: string; icon: IconName; ring?: string; tint?: Tint; dot?: boolean; dashed?: boolean; onPress: () => void }) {
  const t = useTheme();
  const c = tint ? t.tints[tint] : { bg: "transparent", fg: t.text };
  return (
    <Pressable onPress={onPress} style={{ alignItems: "center", gap: 6, width: 68 }}>
      <View
        style={{
          width: 58,
          height: 58,
          borderRadius: 29,
          borderWidth: 2.5,
          borderColor: ring ?? t.border,
          borderStyle: dashed ? "dashed" : "solid",
          padding: 3,
        }}
      >
        <View style={{ flex: 1, borderRadius: 26, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={20} color={c.fg} />
        </View>
        {dot ? <View style={{ position: "absolute", top: 1, right: 1, width: 11, height: 11, borderRadius: 6, backgroundColor: brand.red, borderWidth: 2, borderColor: t.bg }} /> : null}
      </View>
      <T variant="caption" numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}

export default function Home() {
  const t = useTheme();
  const { profile } = useAuth();
  const q = useApi<HomeBundle>(async () => {
    const [home, departments] = await Promise.all([api<HomeData>("/me/home"), api<Department[]>("/departments").catch(() => [])]);
    const first = home.continue_learning.find((c) => !c.completed_at);
    const course = first ? await api<CourseDetail>(`/courses/${first.id}`).catch(() => null) : null;
    return { home, departments, course };
  });
  const [busy, setBusy] = useState(false);

  const data = q.data;
  const home = data?.home;
  const m = home?.membership;
  const firstName = profile?.display_name.split(" ")[0] ?? "";
  const live = home?.live_now[0];
  const next = home?.upcoming_events.find((e) => e.status === "scheduled");
  const later = home?.upcoming_events.filter((e) => e.id !== next?.id) ?? [];
  const featured = home?.new_resources.find((r) => r.kind === "audio" || r.kind === "video") ?? home?.new_resources[0];
  const course = data?.course;
  const done = course?.lessons.filter((l) => l.completed).length ?? 0;
  const nextLesson = course?.lessons.find((l) => !l.completed);
  const groups = (data?.departments ?? []).filter((d) => d.id !== m?.department_id).slice(0, 6);

  const going = async () => {
    if (!next || !data) return;
    setBusy(true);
    try {
      const updated = await toggleRegistration(next);
      q.setData({ ...data, home: { ...data.home, upcoming_events: data.home.upcoming_events.map((e) => (e.id === updated.id ? updated : e)) } });
    } catch (err) {
      notify("Couldn't update", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const joinGroup = async (d: Department) => {
    try {
      await api("/me/department", { method: "PUT", body: { department_id: d.id } });
      notify(`Welcome to ${d.name}`, m?.department_name ? `You've left ${m.department_name}.` : undefined);
      q.reload();
    } catch (err) {
      notify("Couldn't join", errorText(err));
    }
  };

  return (
    <Screen onRefresh={q.refresh} refreshing={q.refreshing}>
      <Row style={{ justifyContent: "space-between", paddingTop: 10, paddingBottom: 14 }}>
        <Row gap={10}>
          <Image source={crest} style={{ width: 34, height: 34 }} />
          <View>
            <T variant="caption" muted>
              Welcome back
            </T>
            <T variant="h3">{firstName ? `Hi, ${firstName}` : "Hi there"}</T>
          </View>
        </Row>
        <Row gap={4}>
          <IconButton icon="search" label="Search" bordered onPress={() => router.push("/search")} />
          <View>
            <IconButton icon="bell" label="Notifications" bordered onPress={() => router.push("/notifications")} />
            {home?.unread_notifications ? (
              <View style={{ position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: brand.red, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                <T variant="caption" color="#FFFFFF" style={{ fontSize: 10 }}>
                  {home.unread_notifications > 9 ? "9+" : home.unread_notifications}
                </T>
              </View>
            ) : null}
          </View>
        </Row>
      </Row>

      <Row gap={6} style={{ marginBottom: 18 }}>
        {m?.chapter_id ? (
          <Bubble label="My chapter" icon="users" ring={brand.red} tint="pink" dot={(home?.recent_posts.length ?? 0) > 0} onPress={() => router.push(`/chapter/${m.chapter_id}`)} />
        ) : (
          <Bubble label="Find chapter" icon="map-pin" ring={brand.red} tint="pink" onPress={() => router.push("/choose-chapter")} />
        )}
        {m?.department_name ? <Bubble label={m.department_name} icon="music" ring={brand.gold} tint="yellow" onPress={() => router.push("/groups")} /> : null}
        <Bubble label="Join" icon="plus" dashed onPress={() => router.push("/groups")} />
      </Row>

      {q.loading ? <Loading /> : null}
      {q.error && !data ? <ErrorView message={q.error} onRetry={q.reload} /> : null}

      {live ? <LiveCard meeting={live} /> : null}

      {next ? (
        <Pressable onPress={() => router.push(`/event/${next.id}`)} style={{ marginTop: live ? 14 : 0 }}>
          <View style={{ backgroundColor: brand.red, borderRadius: 20, padding: 16, overflow: "hidden", gap: 8 }}>
            <Blob size={150} color={brand.gold} top={-60} right={-30} />
            <Blob size={22} color={brand.green} top={56} right={34} />
            <View style={{ backgroundColor: "rgba(255,255,255,0.18)", alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <T variant="overline" color="#FFFFFF">
                NEXT UP · {dayDateUpper(next.starts_at)}
              </T>
            </View>
            <T variant="h1" color="#FFFFFF" numberOfLines={2} style={{ paddingRight: 70 }}>
              {next.title}
            </T>
            <Row gap={6}>
              <Icon name="clock" size={14} color="#FFFFFF" />
              <T variant="small" color="#FFFFFF">
                {time(new Date(next.starts_at))}
                {where(next) ? ` · ${where(next)}` : ""}
              </T>
            </Row>
            <Row style={{ justifyContent: "space-between", marginTop: 6 }}>
              <Row gap={0}>
                {["#F5C77E", "#B9F0B0", "#FFFFFF"].map((c, i) => (
                  <View key={c} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c, borderWidth: 2, borderColor: brand.red, marginLeft: i ? -7 : 0 }} />
                ))}
                <T variant="caption" color="#FFFFFF" style={{ marginLeft: 6 }}>
                  {next.registered_count} going
                </T>
              </Row>
              <Button
                label={next.my_registration ? (next.my_registration === "waitlisted" ? "On waitlist" : "You're going ✓") : "I'm going"}
                variant="light"
                small
                full={false}
                loading={busy}
                onPress={going}
              />
            </Row>
          </View>
        </Pressable>
      ) : data && !live ? (
        <Card style={{ alignItems: "center", paddingVertical: 22, gap: 6 }}>
          <Icon name="calendar" size={22} color={t.textMuted} />
          <T variant="small" muted center>
            No upcoming events yet. Check back soon.
          </T>
        </Card>
      ) : null}

      {course ? (
        <Pressable onPress={() => router.push(`/course/${course.id}`)} style={{ marginTop: 14 }}>
          <View style={{ backgroundColor: t.learnCard, borderRadius: 20, padding: 16, gap: 8 }}>
            <T variant="overline" color={t.learnCardFg}>
              KEEP LEARNING · LESSON {Math.min(done + 1, course.lesson_count)} OF {course.lesson_count}
            </T>
            <Row style={{ justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1, gap: 8 }}>
                <T variant="h3" color={t.learnCardFg} numberOfLines={1}>
                  {course.title}
                </T>
                <ProgressBar value={course.lesson_count ? (done / course.lesson_count) * 100 : 0} color={brand.red} track="rgba(0,0,0,0.12)" />
                <T variant="caption" color={t.learnCardFg}>
                  {nextLesson?.duration_minutes ? `About ${nextLesson.duration_minutes} min left` : `${done} of ${course.lesson_count} lessons done`}
                </T>
              </View>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#6B4E0F", alignItems: "center", justifyContent: "center" }}>
                <Icon name="play" size={18} color="#FFFFFF" />
              </View>
            </Row>
          </View>
        </Pressable>
      ) : null}

      {data ? (
        <Row gap={12} style={{ marginTop: 14, alignItems: "stretch" }}>
          <Card style={{ flex: 1, gap: 6 }} bg={t.tints.green.bg} bordered={false} onPress={() => (m?.chapter_id ? router.push(`/chapter/${m.chapter_id}`) : router.push("/choose-chapter"))}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.tints.green.fg, alignItems: "center", justifyContent: "center" }}>
              <Icon name="users" size={16} color={t.tints.green.bg} />
            </View>
            <T variant="overline" color={t.tints.green.fg} style={{ marginTop: 12 }}>
              MY CHAPTER
            </T>
            <T variant="title" color={t.tints.green.fg} numberOfLines={1}>
              {m?.chapter_name ?? "Find a chapter"}
            </T>
            <T variant="caption" color={t.tints.green.fg}>
              {m?.chapter_id
                ? home!.recent_posts.length
                  ? `${home!.recent_posts.length} new updates from your leaders. `
                  : "See what's happening. "
                : "Join the chapter you attend. "}
              <T variant="caption" weight="bold" color={t.tints.green.fg} style={{ textDecorationLine: "underline" }}>
                View all
              </T>
            </T>
          </Card>
          <Card style={{ flex: 1, gap: 6 }} bg={t.tints.pink.bg} bordered={false} onPress={() => (featured ? router.push(`/sermon/${featured.id}`) : router.push("/learn/sermons"))}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.scheme === "dark" ? "#FFFFFF" : "#2A0000", alignItems: "center", justifyContent: "center" }}>
              <Icon name="play" size={15} color={t.scheme === "dark" ? brand.red : "#FFFFFF"} />
            </View>
            <T variant="overline" color={t.tints.pink.fg} style={{ marginTop: 12 }}>
              {featured ? "FEATURED SERMON" : "SERMONS"}
            </T>
            <T variant="title" color={t.tints.pink.fg} numberOfLines={2}>
              {featured?.title ?? "Listen and watch"}
            </T>
            <T variant="caption" color={t.tints.pink.fg} numberOfLines={1}>
              {featured ? [featured.author_name, duration(featured.duration_seconds)].filter(Boolean).join(" · ") : "Messages from CYC"}
            </T>
          </Card>
        </Row>
      ) : null}

      {later.length ? (
        <>
          <SectionHeader title="This month" action="See all" onAction={() => router.push("/events")} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 18 }} style={{ marginRight: -18 }}>
            {later.slice(0, 8).map((e, i) => (
              <Card key={e.id} onPress={() => router.push(`/event/${e.id}`)} style={{ width: 200, gap: 10 }}>
                <DateBadge iso={e.starts_at} tint={tintFor(i)} />
                <T variant="title" numberOfLines={1}>
                  {e.title}
                </T>
                <T variant="caption" muted numberOfLines={2}>
                  {new Date(e.starts_at).toLocaleString("en", { weekday: "short", day: "numeric", month: "short" })} · {time(new Date(e.starts_at))}
                  {where(e) ? ` · ${where(e)}` : ""}
                </T>
              </Card>
            ))}
          </ScrollView>
        </>
      ) : null}

      {groups.length ? (
        <>
          <SectionHeader title="Groups you might like" action="See all" onAction={() => router.push("/groups")} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 18 }} style={{ marginRight: -18 }}>
            {groups.map((g, i) => (
              <Card key={g.id} style={{ width: 170, gap: 8 }}>
                <IconTile icon="users" tint={tintFor(i)} size={34} rounded={17} />
                <T variant="title" numberOfLines={1}>
                  {g.name}
                </T>
                <T variant="caption" muted numberOfLines={2} style={{ minHeight: 30 }}>
                  {g.description || plural(g.member_count, "member")}
                </T>
                <Button label="Join" small full={false} variant="outline" onPress={() => joinGroup(g)} />
              </Card>
            ))}
          </ScrollView>
        </>
      ) : null}
    </Screen>
  );
}

