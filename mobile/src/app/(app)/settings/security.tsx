import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, Platform, View } from "react-native";

import { Alert, Badge, Button, Card, Dialog, Field, Header, ListGroup, ListRow, Row, Screen, SectionHeader, Snackbar, T, TextButton, Toggle } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type MfaStatus = { enabled: boolean; required: boolean; recovery_codes_left: number };
type Setup = { secret: string; otpauth_uri: string };

const mono = Platform.select({ ios: "Menlo", default: "monospace" });

/** Sign-in & security: password, Google, two-step sign-in, sessions. */
export default function Security() {
  const { user, reload, signOut } = useAuth();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [asking, setAsking] = useState<"disable" | "codes" | "everywhere" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [snack, setSnack] = useState<string | null>(null);

  const load = useCallback(() => {
    api<MfaStatus>("/auth/mfa").then(setStatus).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  const start = async () => {
    setError("");
    try {
      setSetup(await api<Setup>("/auth/mfa/setup", { method: "POST", body: {} }));
    } catch (err) {
      setError(errorText(err));
    }
  };

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

  const enable = () =>
    run(async () => {
      const res = await api<{ recovery_codes: string[] }>("/auth/mfa/enable", { method: "POST", body: { code: code.trim() } });
      setCodes(res.recovery_codes);
      setSetup(null);
      setCode("");
      load();
      await reload();
    });

  const confirmAsk = () =>
    run(async () => {
      if (asking === "disable") {
        await api("/auth/mfa/disable", { method: "POST", body: { code: code.trim() } });
        setSnack("Two-step sign-in is off");
        load();
        await reload();
      } else if (asking === "codes") {
        const res = await api<{ recovery_codes: string[] }>("/auth/mfa/recovery-codes", { method: "POST", body: { code: code.trim() } });
        setCodes(res.recovery_codes);
        load();
      } else if (asking === "everywhere") {
        await api("/auth/logout-everywhere", { method: "POST" });
        await signOut();
        return;
      }
      setAsking(null);
      setCode("");
    });

  return (
    <Screen edges={["top", "bottom"]}>
      <Header title="Sign-in & security" />

      <SectionHeader title="How you sign in" style={{ marginTop: 4 }} />
      <ListGroup>
        <ListRow icon="mail" iconCircle label="Email" sublabel={user?.email} chevron={false} />
        <ListRow
          icon="lock"
          iconCircle
          label={user?.has_password === false ? "Add a password" : "Password"}
          sublabel={user?.has_password === false ? "Also sign in with email and password" : "Change your password"}
          onPress={() => router.push({ pathname: "/settings/password", params: user?.has_password === false ? { mode: "set" } : {} })}
        />
        <ListRow
          icon="globe"
          iconCircle
          label="Google"
          sublabel={user?.google_linked ? "Connected – you can sign in with Google" : "Not connected. Sign in with Google using this email to connect it."}
          chevron={false}
          right={user?.google_linked ? <Badge label="On" /> : undefined}
        />
      </ListGroup>

      <SectionHeader title="Two-step sign-in" />
      <ListGroup>
        <ListRow
          icon="shield"
          iconCircle
          label="Authenticator app code"
          sublabel={
            status?.enabled
              ? `On · ${status.recovery_codes_left} recovery codes left`
              : "Ask for a code from your phone when you sign in"
          }
          chevron={false}
          right={
            <Toggle
              label="Two-step sign-in"
              value={Boolean(status?.enabled) || setup !== null}
              disabled={status?.required && status.enabled}
              onChange={(on) => (on ? void start() : status?.enabled ? setAsking("disable") : setSetup(null))}
            />
          }
        />
        {status?.enabled ? <ListRow icon="list" iconCircle label="New recovery codes" onPress={() => setAsking("codes")} /> : null}
      </ListGroup>
      {status?.required ? (
        <T variant="bodySmall" muted style={{ marginTop: 8 }}>
          Admins must keep two-step sign-in on.
        </T>
      ) : null}

      {setup ? (
        <Card style={{ gap: 10, marginTop: 14 }}>
          <T variant="titleSmall">1. Add CYC to your authenticator app</T>
          <Button label="Open authenticator app" variant="tonal" icon="external-link" onPress={() => Linking.openURL(setup.otpauth_uri).catch(() => setError("No authenticator app found. Add the key by hand."))} />
          <Row gap={8} style={{ justifyContent: "space-between" }}>
            <T variant="titleSmall" selectable style={{ flex: 1, fontFamily: mono }}>
              {setup.secret.match(/.{1,4}/g)?.join(" ")}
            </T>
            <TextButton label="Copy" onPress={() => Clipboard.setStringAsync(setup.secret).then(() => setSnack("Key copied"))} />
          </Row>
          <T variant="titleSmall">2. Enter the 6-digit code it shows</T>
          <Field label="6-digit code" icon="hash" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={6} error={error || undefined} />
          <Button label="Turn on" onPress={enable} loading={busy} disabled={!/^\d{6}$/.test(code)} />
        </Card>
      ) : null}

      {codes ? (
        <Card style={{ gap: 10, marginTop: 14 }}>
          <Alert tone="warning" text="Save these recovery codes somewhere safe. Each one signs you in once if you lose your phone. They won't be shown again." />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {codes.map((c) => (
              <T key={c} variant="titleSmall" style={{ width: "46%", fontFamily: mono }}>
                {c}
              </T>
            ))}
          </View>
          <Row gap={8}>
            <Button label="Copy" variant="outline" icon="copy" style={{ flex: 1 }} onPress={() => Clipboard.setStringAsync(codes.join("\n")).then(() => setSnack("Copied"))} />
            <Button label="Done" style={{ flex: 1 }} onPress={() => setCodes(null)} />
          </Row>
        </Card>
      ) : null}

      <SectionHeader title="Devices" />
      <ListGroup>
        <ListRow icon="log-out" iconCircle label="Sign out everywhere" sublabel="Every phone and browser, including this one" chevron={false} onPress={() => setAsking("everywhere")} />
      </ListGroup>
      {error && !setup ? (
        <View style={{ marginTop: 12 }}>
          <Alert tone="error" text={error} />
        </View>
      ) : null}

      <Dialog
        visible={asking !== null}
        icon={asking === "everywhere" ? "log-out" : "shield"}
        title={asking === "disable" ? "Turn off two-step sign-in?" : asking === "codes" ? "Get new recovery codes?" : "Sign out everywhere?"}
        text={asking === "everywhere" ? "You'll need to sign in again on every device." : asking === "codes" ? "Your old codes will stop working." : undefined}
        confirm={asking === "disable" ? "Turn off" : asking === "codes" ? "Get codes" : "Sign out"}
        danger={asking === "disable"}
        busy={busy}
        onConfirm={confirmAsk}
        onCancel={() => (setAsking(null), setCode(""), setError(""))}
      >
        {asking === "everywhere" ? null : (
          <Field label="Code from your authenticator app" icon="hash" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={11} error={error || undefined} />
        )}
      </Dialog>
      <Snackbar text={snack} onHide={() => setSnack(null)} />
    </Screen>
  );
}
