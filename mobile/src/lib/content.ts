/**
 * About CYC content (Figma: About CYC pages). Everything in [brackets] is a
 * placeholder from the designs: CYC needs to supply the real text before
 * launch. Edit it here; no other code changes are needed.
 */

export const CYC_CONTACT = {
  email: "support@cyc.org",
  phone: "[Phone]",
};

export const ABOUT = {
  intro: "[One or two sentences on who CYC is and what it does for young people.]",
  history: {
    title: "History",
    lead: "How CYC began",
    body: "[How CYC began: the founders, the year and the first chapter.]\n\n[How it has grown since.]",
  },
  mission: "[Mission statement, in CYC’s own words.]",
  vision: "[Vision statement, in CYC’s own words.]",
  values: [
    { title: "[Value]", text: "[What this value means for members.]" },
    { title: "[Value]", text: "[What this value means for members.]" },
    { title: "[Value]", text: "[What this value means for members.]" },
    { title: "[Value]", text: "[What this value means for members.]" },
  ],
  leaders: [
    { name: "[Name]", role: "[Role]" },
    { name: "[Name]", role: "[Role]" },
    { name: "[Name]", role: "[Role]" },
    { name: "[Name]", role: "[Role]" },
  ],
  structure: [
    { title: "CYC national", text: "Leads CYC and sets direction" },
    { title: "Country", text: "CYC in each country" },
    { title: "Chapter", text: "Local groups that meet in a city" },
    { title: "Departments & interest groups", text: "Where members serve and connect" },
  ],
  constitutionUrl: null as string | null,
  privacyPolicyUrl: null as string | null,
  termsUrl: null as string | null,
};

export const ANTHEM = {
  title: "[Anthem title]",
  credit: "[Writer or composer] · [Year]",
  /** Link to the anthem recording (audio). */
  audioUrl: null as string | null,
  videoUrl: null as string | null,
  verses: [
    { label: "VERSE 1", lines: ["[Line of the anthem]", "[Line of the anthem]", "[Line of the anthem]", "[Line of the anthem]"] },
    { label: "CHORUS", lines: ["[Line of the chorus]", "[Line of the chorus]", "[Line of the chorus]"] },
    { label: "VERSE 2", lines: ["[Line of the anthem]", "[Line of the anthem]", "[Line of the anthem]", "[Line of the anthem]"] },
  ],
};
