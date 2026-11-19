import { useState } from "react";
import { View } from "react-native";

import { notify } from "@/components/cards";
import { ErrorView, Header, IconName, ListGroup, ListRow, Loading, Screen, T, Toggle } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { NotificationCategory, Preference } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const TOPICS: { category: NotificationCategory; label: string; sub: string; icon: IconName }[] = [
  { category: "events", label: "Events and reminders", sub: "Before events you're going to", icon: "calendar" },
  { category: "meetings", label: "Live meetings", sub: "When a meeting you can join starts", icon: "radio" },
  { category: "chapter", label: "Announcements", sub: "News from CYC and your chapter", icon: "megaphone" },
  { category: "resources", label: "New sermons and resources", sub: "When something new is published", icon: "headphones" },
  { category: "social", label: "Comments and replies", sub: "When someone replies to your post", icon: "message" },
];

function Section({ title }: { title: string }) {
  return (
    <T variant="h3" style={{ marginTop: 22, marginBottom: 10 }}>
      {title}
    </T>
  );
}

export default function NotificationSettings() {
  const { user } = useAuth();
  const q = useApi(() => api<Preference[]>("/notifications/preferences"), [], { refetchOnFocus: false });
  const [saving, setSaving] = useState(false);
  const prefs = q.data ?? [];
  const get = (c: NotificationCategory) => prefs.find((p) => p.category === c) ?? { category: c, push: true, email: false };
  const anyPush = prefs.some((p) => p.push);
  const anyEmail = prefs.some((p) => p.email);

  const save = async (next: Preference[]) => {
    const before = q.data;
    q.setData(next);
    setSaving(true);
    try {
      q.setData(await api<Preference[]>("/notifications/preferences", { method: "PATCH", body: { preferences: next.map(({ category, push, email }) => ({ category, push, email })) } }));
    } catch (err) {
      if (before) q.setData(before);
      notify("Couldn't save", errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const all = TOPICS.map((x) => get(x.category));
  // Turning a channel on applies it to the topics you already hear about
  // (or to every topic, if everything was off).
  const noneOn = !anyPush && !anyEmail;
  const setChannel = (channel: "push" | "email", on: boolean) =>
    save(all.map((p) => ({ ...p, [channel]: on ? noneOn || p.push || p.email : false })));
  const setTopic = (c: NotificationCategory, on: boolean) =>
    save(all.map((p) => (p.category !== c ? p : on ? { ...p, push: anyPush || !anyEmail, email: anyEmail } : { ...p, push: false, email: false })));

  return (
    <Screen>
      <Header title="Notification settings" />
      <T variant="small" muted>
        Choose what you hear about and how. Important notices from CYC are always sent.
      </T>
      {q.loading ? <Loading /> : null}
      {q.error && !q.data ? <ErrorView message={q.error} onRetry={q.reload} /> : null}
      {q.data ? (
        <View style={{ opacity: saving ? 0.7 : 1 }}>
          <Section title="How you hear" />
          <ListGroup>
            <ListRow icon="bell" label="Push notifications" sublabel="On this phone" right={<Toggle value={anyPush} onChange={(v) => setChannel("push", v)} />} />
            <ListRow icon="mail" label="Email" sublabel={user?.email} right={<Toggle value={anyEmail} onChange={(v) => setChannel("email", v)} />} />
          </ListGroup>

          <Section title="What you hear about" />
          <ListGroup>
            {TOPICS.map((x) => {
              const p = get(x.category);
              return (
                <ListRow
                  key={x.category}
                  icon={x.icon}
                  label={x.label}
                  sublabel={x.sub}
                  right={<Toggle value={p.push || p.email} disabled={!anyPush && !anyEmail} onChange={(v) => setTopic(x.category, v)} />}
                />
              );
            })}
          </ListGroup>
          {!anyPush && !anyEmail ? (
            <T variant="caption" muted style={{ marginTop: 8 }}>
              Turn on push or email to choose topics.
            </T>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
