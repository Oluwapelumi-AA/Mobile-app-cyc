/** A one-off message for the next screen to show in a snackbar ("Welcome back"). */
let pending: string | null = null;

export const setFlash = (message: string) => {
  pending = message;
};

export const takeFlash = () => {
  const m = pending;
  pending = null;
  return m;
};
