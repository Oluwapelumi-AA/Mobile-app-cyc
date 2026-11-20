import * as Clipboard from "expo-clipboard";
import * as Print from "expo-print";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useRef, useState } from "react";
import { Platform, Share, View } from "react-native";

import { CertificateCard, certificateHtml, verifyLink } from "@/components/CertificateCard";
import { notify } from "@/components/cards";
import { Button, EmptyState, ErrorView, Header, Loading, Row, Screen, Snackbar, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import type { Certificate } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** One certificate (Figma: Certificate – View). */
export default function CertificateScreen() {
  const t = useTheme();
  const { course } = useLocalSearchParams<{ course: string }>();
  const q = useApi(() => api<Certificate[]>("/certificates/mine"), [course]);
  const cert = q.data?.find((c) => c.course_id === course);
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  // Filled by the hidden QR so the PDF can carry the same code.
  const qrRef = useRef<{ toDataURL?: (cb: (d: string) => void) => void } | null>(null);

  const download = async () => {
    if (!cert) return;
    setBusy(true);
    try {
      const qr = await new Promise<string | undefined>((resolve) => {
        if (!qrRef.current?.toDataURL) return resolve(undefined);
        qrRef.current.toDataURL((d) => resolve(`data:image/png;base64,${d}`));
        setTimeout(() => resolve(undefined), 1500);
      });
      const html = certificateHtml(cert, qr);
      if (Platform.OS === "web") {
        await Print.printAsync({ html });
        return;
      }
      const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "Save your certificate" });
      } else {
        setSnack("PDF saved");
      }
    } catch (err) {
      notify("Couldn't make the PDF", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!cert?.certificate_number) return;
    const link = verifyLink(cert.certificate_number);
    const message = `I completed “${cert.course_title}” with Christ Youth Club. Certificate ${cert.certificate_number}: ${link}`;
    try {
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(message);
        setSnack("Link copied");
      } else {
        await Share.share({ message });
      }
    } catch {
      /* closed */
    }
  };

  return (
    <Screen
      edges={["top", "bottom"]}
      footer={
        cert ? (
          <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }}>
            <Button label="Download PDF" icon="download" onPress={download} loading={busy} />
            <Row gap={8}>
              <Button label="Share" icon="share" variant="outline" onPress={share} style={{ flex: 1 }} disabled={!cert.certificate_number} />
              <Button
                label="Verify"
                icon="seal-check"
                variant="outline"
                style={{ flex: 1 }}
                disabled={!cert.certificate_number}
                onPress={() => router.push({ pathname: "/verify", params: { n: cert.certificate_number! } })}
              />
            </Row>
          </View>
        ) : null
      }
    >
      <Header small title="Certificate" />
      {q.loading && !q.data ? <Loading /> : null}
      {q.error && !q.data ? <ErrorView message={q.error} onRetry={q.reload} /> : null}
      {q.data && !cert ? (
        <EmptyState icon="certificate" tint="yellow" title="No certificate yet" text="Finish every lesson in this course to earn it." action="Go to the course" onAction={() => router.replace(`/course/${course}`)} />
      ) : null}
      {cert ? (
        <>
          <CertificateCard cert={cert} qrRef={qrRef} />
          <T variant="bodySmall" muted center style={{ marginTop: 14, color: t.textMuted }}>
            Anyone can scan the code or enter the number at Verify to check it’s real.
          </T>
        </>
      ) : null}
      <Snackbar text={snack} onHide={() => setSnack(null)} />
    </Screen>
  );
}
