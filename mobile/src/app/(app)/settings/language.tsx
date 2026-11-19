import { useState } from "react";

import { notify } from "@/components/cards";
import { Header, Icon, ListGroup, ListRow, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LANGUAGE_NAMES } from "@/lib/format";
import { useTheme } from "@/lib/theme";

export default function Language() {
  const t = useTheme();
  const { profile, reload } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const current = profile?.language_code ?? "en";

  const pick = async (code: string) => {
    if (code === current) return;
    setBusy(code);
    try {
      await api("/profiles/me", { method: "PATCH", body: { language_code: code } });
      await reload();
    } catch (err) {
      notify("Couldn't change language", errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Header title="Language" />
      <T variant="small" muted style={{ marginBottom: 14 }}>
        Notifications and emails from CYC will use this language.
      </T>
      <ListGroup>
        {Object.entries(LANGUAGE_NAMES).map(([code, label]) => (
          <ListRow
            key={code}
            label={label}
            value={busy === code ? "Saving…" : undefined}
            onPress={() => pick(code)}
            right={code === current ? <Icon name="check" size={18} color={t.primary} /> : <></>}
          />
        ))}
      </ListGroup>
    </Screen>
  );
}
