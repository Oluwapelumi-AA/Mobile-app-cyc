import * as Linking from "expo-linking";
import type { RefObject } from "react";
import { View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { Blob, Row, T } from "@/components/ui";
import { longDate } from "@/lib/format";
import { brand, fonts, radius } from "@/lib/theme";
import type { Certificate } from "@/lib/types";

/** Address a QR code or shared link opens to check a certificate. */
export const verifyLink = (n: string) => Linking.createURL("/verify", { queryParams: { n } });

const SIGNATORY = { name: "National President", role: "Christ Youth Club" };

/** The certificate as it looks on screen (Figma: Certificate). */
type QrRef = RefObject<any>;

export function CertificateCard({ cert, qrRef }: { cert: Certificate; qrRef?: QrRef }) {
  return (
    <View style={{ backgroundColor: "#FFFDF7", borderRadius: radius.xl, borderWidth: 6, borderColor: brand.gold, padding: 22, overflow: "hidden", gap: 10 }}>
      <Blob size={140} color="rgba(200,152,48,0.12)" right={-50} top={-50} />
      <Blob size={100} color="rgba(153,0,0,0.06)" left={-40} bottom={-40} />
      <Row gap={10}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: brand.maroon, alignItems: "center", justifyContent: "center" }}>
          <T variant="labelLarge" color="#FFFFFF">
            CYC
          </T>
        </View>
        <T variant="labelMedium" color={brand.maroon}>
          CHRIST YOUTH CLUB
        </T>
      </Row>
      <T variant="labelMedium" color="#6B5A2A" style={{ marginTop: 8 }}>
        CERTIFICATE OF COMPLETION
      </T>
      <T variant="bodySmall" color="#4B4641">
        This is to certify that
      </T>
      <T variant="headlineMedium" color="#1D1B19" style={{ fontFamily: fonts.brandBold }}>
        {cert.user_name ?? "CYC member"}
      </T>
      <T variant="bodySmall" color="#4B4641">
        has completed the course
      </T>
      <T variant="titleLarge" color={brand.maroon}>
        {cert.course_title}
      </T>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-end", marginTop: 12 }}>
        <View style={{ gap: 2, flex: 1 }}>
          <T variant="labelSmall" color="#7C7670">
            DATE
          </T>
          <T variant="bodyMedium" color="#1D1B19">
            {longDate(cert.completed_at)}
          </T>
          <View style={{ height: 1, backgroundColor: "#CCC5BF", width: 140, marginTop: 14 }} />
          <T variant="bodySmall" color="#1D1B19">
            {SIGNATORY.name}
          </T>
          <T variant="labelSmall" color="#7C7670">
            {SIGNATORY.role}
          </T>
        </View>
        {cert.certificate_number ? (
          <View style={{ alignItems: "center", gap: 4 }}>
            <View style={{ backgroundColor: "#FFFFFF", padding: 6, borderRadius: 8 }}>
              <QRCode getRef={qrRef ? (r) => (qrRef.current = r) : undefined} value={verifyLink(cert.certificate_number)} size={72} color="#1D1B19" backgroundColor="#FFFFFF" />
            </View>
            <T variant="labelSmall" color="#7C7670">
              {cert.certificate_number}
            </T>
          </View>
        ) : null}
      </Row>
    </View>
  );
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

/** Printable HTML for the PDF download. */
export function certificateHtml(cert: Certificate, qrDataUrl?: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4 landscape; margin: 0 }
  body { margin:0; font-family: Helvetica, Arial, sans-serif; color:#1D1B19 }
  .page { box-sizing:border-box; width:297mm; height:210mm; padding:18mm; background:#FFFDF7; border:10mm solid #C89830; position:relative }
  .crest { width:56px; height:56px; border-radius:28px; background:#990000; color:#fff; font-weight:800; display:flex; align-items:center; justify-content:center }
  .org { color:#990000; font-weight:700; letter-spacing:2px; margin-left:14px }
  h1 { font-size:46px; margin:10px 0 }
  .course { font-size:28px; color:#990000; font-weight:700 }
  .small { color:#4B4641; letter-spacing:1px }
  .foot { position:absolute; left:18mm; right:18mm; bottom:16mm; display:flex; justify-content:space-between; align-items:flex-end }
  .sig { border-top:1px solid #CCC5BF; padding-top:6px; width:220px }
  </style></head><body><div class="page">
  <div style="display:flex;align-items:center"><div class="crest">CYC</div><div class="org">CHRIST YOUTH CLUB</div></div>
  <p class="small" style="margin-top:36px">CERTIFICATE OF COMPLETION</p>
  <p class="small">This is to certify that</p>
  <h1>${esc(cert.user_name ?? "CYC member")}</h1>
  <p class="small">has completed the course</p>
  <div class="course">${esc(cert.course_title)}</div>
  <div class="foot">
    <div><div class="small">DATE</div><div>${esc(longDate(cert.completed_at))}</div>
      <div class="sig" style="margin-top:28px">${SIGNATORY.name}<br><span class="small">${SIGNATORY.role}</span></div></div>
    <div style="text-align:center">${qrDataUrl ? `<img src="${qrDataUrl}" width="110" height="110"/>` : ""}
      <div class="small">${esc(cert.certificate_number ?? "")}</div></div>
  </div></div></body></html>`;
}
