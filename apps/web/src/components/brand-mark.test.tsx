import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandMark } from "./brand-mark";

describe("BrandMark", () => {
  it("renders the product name", () => {
    render(<BrandMark />);
    expect(screen.getByText("Hyrum")).toBeInTheDocument();
  });
});
