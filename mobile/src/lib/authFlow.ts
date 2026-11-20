import { router } from "expo-router";

import type { SignInStep } from "./auth";

/** Move on after a sign-in call. "done" needs nothing: the root layout
 * switches to the app as soon as the account loads. */
export function goToStep(step: SignInStep, replace = false) {
  const go = replace ? router.replace : router.push;
  if (step.kind === "verify") go({ pathname: "/verify-email", params: { email: step.email } });
  else if (step.kind === "mfa") go({ pathname: "/two-step", params: { token: step.mfaToken } });
  else if (step.kind === "mfaSetup") go({ pathname: "/two-step", params: { token: step.mfaToken, setup: "1" } });
}
