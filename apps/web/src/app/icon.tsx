import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#090d09",
        color: "#d4b36f",
        display: "flex",
        fontFamily: "sans-serif",
        fontSize: 22,
        fontWeight: 700,
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      H
    </div>,
    size,
  );
}
