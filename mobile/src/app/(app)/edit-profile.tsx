import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";

import { notify } from "@/components/cards";
import { PickerSheet } from "@/components/Picker";
import { Avatar, Button, Field, Header, Icon, ListGroup, ListRow, Screen, SectionHeader, SelectField, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { COUNTRIES, countryName } from "@/lib/location";
import { brand, useTheme } from "@/lib/theme";
import type { Profile } from "@/lib/types";

type Intent = { upload_url: string; method: "PUT" | "POST"; headers: Record<string, string>; object_key: string; max_size_bytes: number };

/** Edit profile (Figma: Profile – Edit). */
export default function EditProfile() {
  const t = useTheme();
  const { profile, user, membership, reload } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  // Shown without the +234 prefix while editing.
  const [phone, setPhone] = useState((profile?.phone ?? "").replace(/^\+234/, ""));
  const [country, setCountry] = useState(profile?.country_code ?? "");
  const [picking, setPicking] = useState(false);
  const [photo, setPhoto] = useState<string | null>(profile?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState("");

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    const type = asset.mimeType && ["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType) ? asset.mimeType : "image/jpeg";
    setUploading(true);
    try {
      const blob = await (await fetch(asset.uri)).blob();
      const intent = await api<Intent>("/profiles/me/avatar/upload-intent", { method: "POST", body: { content_type: type, size_bytes: blob.size || asset.fileSize || 1 } });
      const put = await fetch(intent.upload_url, { method: intent.method, headers: { "Content-Type": type, ...intent.headers }, body: blob });
      if (!put.ok) throw new Error("The photo didn’t upload. Try again.");
      const updated = await api<Profile>("/profiles/me/avatar/confirm", { method: "POST", body: { object_key: intent.object_key } });
      setPhoto(updated.avatar_url);
      await reload();
    } catch (err) {
      notify("Couldn’t change your photo", errorText(err));
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    try {
      await api("/profiles/me/avatar", { method: "DELETE" });
      setPhoto(null);
      await reload();
    } catch (err) {
      notify("Couldn’t remove your photo", errorText(err));
    }
  };

  const save = async () => {
    if (!name.trim()) return setNameError("Your name can’t be empty.");
    const digits = phone.replace(/[^\d]/g, "").replace(/^0/, "");
    if (digits && (digits.length < 7 || digits.length > 12)) return notify("Check your phone number", "Enter it without the leading 0, e.g. 803 123 4567.");
    setBusy(true);
    try {
      await api("/profiles/me", {
        method: "PATCH",
        body: { display_name: name.trim(), bio: bio.trim() || null, phone: digits ? `+234${digits}` : null, country_code: country || null },
      });
      await reload();
      router.back();
    } catch (err) {
      notify("Couldn’t save", errorText(err));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen
        edges={["top", "bottom"]}
        footer={
          <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            <Button label="Save changes" onPress={save} loading={busy} />
          </View>
        }
      >
        <Header title="Edit profile" />
        <View style={{ alignItems: "center", gap: 8, marginBottom: 20 }}>
          <Pressable onPress={pickPhoto} accessibilityRole="button" accessibilityLabel="Change photo" disabled={uploading}>
            <Avatar name={name || "?"} size={104} uri={photo} />
            <View style={{ position: "absolute", right: 0, bottom: 0, width: 36, height: 36, borderRadius: 18, backgroundColor: brand.gold, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: t.bg }}>
              <Icon name="camera" size={18} color="#2A1D00" />
            </View>
          </Pressable>
          <Button label={uploading ? "Uploading…" : "Change photo"} variant="text" full={false} small onPress={pickPhoto} disabled={uploading} style={{ alignSelf: "center" }} />
          {photo ? <Button label="Remove photo" variant="text" full={false} small onPress={removePhoto} style={{ alignSelf: "center" }} /> : null}
        </View>

        <Field label="Full name" icon="user" value={name} onChangeText={(v) => (setName(v), setNameError(""))} autoCapitalize="words" error={nameError || undefined} />
        <Field label="Email" icon="mail" value={user?.email ?? ""} editable={false} hint="Your email can’t be changed here." />
        <Field label="Phone" icon="phone" prefix="+234" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="803 123 4567" maxLength={14} />
        <SelectField label="Country" icon="globe" value={countryName(country)} placeholder="Choose a country" onPress={() => setPicking(true)} />
        <View style={{ height: 16 }} />
        <Field label="About you" icon="edit" value={bio} onChangeText={setBio} multiline maxLength={500} placeholder="A line or two other members will see" />

        <SectionHeader title="Membership" style={{ marginTop: 8 }} />
        <ListGroup>
          <ListRow icon="church" iconCircle label={membership?.chapter_name ?? "No chapter yet"} sublabel="Chapter" onPress={() => router.push(membership?.chapter_id ? `/chapter/${membership.chapter_id}` : "/find-chapter")} />
          <ListRow icon="users" iconCircle label={membership?.department_name ?? "No department"} sublabel="Department · manage" onPress={() => router.push("/departments")} />
          <ListRow icon="heart" iconCircle label="Interest groups" sublabel="Manage your groups" onPress={() => router.push("/interest-groups")} />
        </ListGroup>
        <T variant="bodySmall" muted style={{ marginTop: 8 }}>
          Your chapter can’t be changed in the app.
        </T>

        <PickerSheet visible={picking} title="Country" searchable options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))} selected={country} onSelect={setCountry} onClose={() => setPicking(false)} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
