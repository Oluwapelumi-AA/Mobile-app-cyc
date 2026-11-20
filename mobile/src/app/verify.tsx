import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { Blob, Button, Card, Field, Header, Icon, Row, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { longDate } from "@/lib/format";
import { brand, radius, useTheme } from "@/lib/theme";
import type { CertificateCheck } from "@/lib/types";

/** Public certificate check — no sign-in needed (Figma: Verify certificate). */
export default function Verify() {
  const t = useTheme();
  const params = useLocalSearchParams<{ n?: string }>();
  const [number, setNumber] = useState(params.n ?? "");
  const [result, setResult] = useState<CertificateCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async (n = number) => {
    const clean = n.trim().toUpperCase();
    if (!clean) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api<CertificateCheck>(`/certificates/verify/${encodeURIComponent(clean)}`));
    } catch (err) {
      setResult(null);
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (params.n) void Promise.resolve(params.n).then(check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.n]);

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Verify a certificate" subtitle="Enter the number printed under the QR code." />
      <Field label="Certificate number" icon="hash" value={number} onChangeText={setNumber} autoCapitalize="characters" autoCorrect={false} placeholder="CYC-2026-XXXXXX" onSubmitEditing={() => check()} returnKeyType="search" error={error ?? undefined} />
      <Button label="Check" onPress={() => check()} loading={busy} disabled={!number.trim()} />

      {result ? (
        result.valid ? (
          <View style={{ marginTop: 24, backgroundColor: t.c.tertiaryContainer, borderRadius: radius.xxl, padding: 22, overflow: "hidden", gap: 8 }}>
            <Blob size={120} color={brand.gold} right={-40} top={-40} />
            <Row gap={8}>
              <Icon name="seal-check" size={28} color={t.c.onTertiaryContainer} weight="fill" />
              <T variant="titleLarge" color={t.c.onTertiaryContainer}>
                Valid certificate
              </T>
            </Row>
            <Card bg={t.c.surface} bordered={false} style={{ gap: 10, marginTop: 6 }}>
              {[
                ["Awarded to", result.recipient_name ?? "—"],
                ["Course", result.course_title ?? "—"],
                ["Completed", result.completed_at ? longDate(result.completed_at) : "—"],
                ["Number", result.certificate_number],
                ["Issued by", result.issued_by],
              ].map(([k, v]) => (
                <View key={k}>
                  <T variant="labelSmall" muted>
                    {k.toUpperCase()}
                  </T>
                  <T variant="bodyLarge">{v}</T>
                </View>
              ))}
            </Card>
          </View>
        ) : (
          <Card bg={t.c.errorContainer} bordered={false} style={{ marginTop: 24, gap: 6 }}>
            <Row gap={8}>
              <Icon name="warning" color={t.c.onErrorContainer} />
              <T variant="titleMedium" color={t.c.onErrorContainer}>
                We couldn’t find that certificate
              </T>
            </Row>
            <T variant="bodyMedium" color={t.c.onErrorContainer}>
              Check the number for typos. If it still doesn’t match, the certificate may not be genuine.
            </T>
          </Card>
        )
      ) : null}
    </Screen>
  );
}
