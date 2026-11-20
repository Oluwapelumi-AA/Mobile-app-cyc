import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";

import { Dialog, IconTile, T } from "@/components/ui";
import { useAuth } from "@/lib/auth";

type Reason = { title: string; text: string };

const GateContext = createContext<(reason?: Partial<Reason>) => boolean>(() => true);

const DEFAULT: Reason = {
  title: "Create a free account",
  text: "Save sermons, join your chapter, take courses and earn certificates. It takes a minute.",
};

/**
 * Guests can look around, but personal things (saving, joining, courses)
 * need an account. `requireAccount()` returns true for members; for guests
 * it explains why an account helps and returns false.
 */
export function AccountGateProvider({ children }: { children: ReactNode }) {
  const { isGuest, leaveGuest } = useAuth();
  const [reason, setReason] = useState<Reason | null>(null);

  const require = useCallback(
    (r?: Partial<Reason>) => {
      if (!isGuest) return true;
      setReason({ ...DEFAULT, ...r });
      return false;
    },
    [isGuest],
  );

  const value = useMemo(() => require, [require]);

  return (
    <GateContext.Provider value={value}>
      {children}
      <Dialog
        visible={Boolean(reason)}
        title={reason?.title ?? ""}
        confirm="Create account"
        cancel="Not now"
        onCancel={() => setReason(null)}
        onConfirm={() => {
          setReason(null);
          leaveGuest();
          // Land on Create account (step 1) rather than Welcome.
          setTimeout(() => router.push("/sign-up"), 60);
        }}
      >
        <View style={{ gap: 12 }}>
          <View style={{ alignItems: "center" }}>
            <IconTile icon="user" tint="pink" size={56} />
          </View>
          <T variant="bodyMedium" muted>
            {reason?.text}
          </T>
        </View>
      </Dialog>
    </GateContext.Provider>
  );
}

export const useAccountGate = () => useContext(GateContext);
