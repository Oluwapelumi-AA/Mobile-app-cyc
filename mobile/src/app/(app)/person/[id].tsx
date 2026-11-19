import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { Avatar, Badge, Card, ErrorView, Header, ListGroup, ListRow, Loading, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { shortDate } from "@/lib/format";
import type { PublicProfile } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** Someone else's public profile. */
export default function Person() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi(() => api<PublicProfile>(`/profiles/${id}`), [id]);
  const p = q.data;
  return (
    <Screen>
      <Header />
      {!p ? q.error ? <ErrorView message={q.error} onRetry={q.reload} /> : <Loading /> : (
        <>
          <Card style={{ alignItems: "center", gap: 10, paddingVertical: 24 }}>
            <Avatar name={p.display_name} size={72} />
            <T variant="h2" center>
              {p.is_deleted ? "Deleted user" : p.display_name}
            </T>
            {p.membership_status === "member" ? <Badge label="Member" icon="check" /> : <Badge label="Guest" tint="gray" />}
            {p.bio ? (
              <T variant="small" muted center>
                {p.bio}
              </T>
            ) : null}
          </Card>
          <View style={{ height: 16 }} />
          <ListGroup>
            {p.chapter_name ? <ListRow icon="home" label={p.chapter_name} sublabel="Chapter" chevron={false} /> : null}
            {p.department_name ? <ListRow icon="users" label={p.department_name} sublabel="Department" chevron={false} /> : null}
            <ListRow icon="calendar" label={shortDate(p.member_since)} sublabel="Joined CYC" chevron={false} />
          </ListGroup>
        </>
      )}
    </Screen>
  );
}
