import { ImageResponse } from "next/og";
import { siteDescription, siteName } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        background: "#090d09",
        color: "#e9eee8",
        display: "flex",
        flexDirection: "column",
        fontFamily: "sans-serif",
        height: "100%",
        justifyContent: "space-between",
        padding: "72px 80px",
        width: "100%",
      }}
    >
      <div style={{ color: "#d4b36f", display: "flex", fontSize: 30, fontWeight: 700 }}>
        H&nbsp;&nbsp;{siteName}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 930 }}>
        <div style={{ display: "flex", fontSize: 68, fontWeight: 650, lineHeight: 1.06 }}>
          {siteDescription}
        </div>
        <div style={{ color: "#9da99d", display: "flex", fontSize: 28 }}>
          Capture receipts. Replay changes. Block accidental breaks.
        </div>
      </div>
      <div style={{ borderTop: "1px solid #2c352c", display: "flex", paddingTop: 24 }}>
        Deterministic evidence first. GPT-5.6 advisory second.
      </div>
    </div>,
    size,
  );
}
