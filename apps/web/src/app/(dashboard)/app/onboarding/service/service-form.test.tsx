import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServiceForm } from "./service-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("./actions", () => ({
  createServiceAction: vi.fn(),
}));

describe("ServiceForm", () => {
  it("keeps invalid service data on the client and exposes field errors", async () => {
    render(<ServiceForm />);

    fireEvent.click(screen.getByRole("button", { name: "Create service" }));

    expect(await screen.findAllByText(/expected string to have >=2 characters/)).toHaveLength(2);
    expect(screen.getByLabelText("Service name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("URL slug")).toHaveAttribute("aria-invalid", "true");
  });
});
