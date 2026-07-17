import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssertionPinForm } from "./assertion-pin-form";

const props = {
  behaviorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  claimId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  canPin: true,
  permissionReason: null,
  defaultExpiry: "2026-10-13T08:00:00.000Z",
  pinAction: async () => ({
    status: "success" as const,
    message: "Assertion pinned and added to replay enforcement.",
  }),
};

describe("AssertionPinForm", () => {
  it("requires a reason before pinning", () => {
    render(<AssertionPinForm {...props} />);

    expect(screen.getByRole("button", { name: /pin assertion/i })).toBeDisabled();
    expect(screen.getByText("Add a reason before pinning.")).toBeInTheDocument();
  });

  it("uses the 90-day expiry date and reports persisted submission", async () => {
    render(<AssertionPinForm {...props} />);

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Keep the importer stable during migration." },
    });
    fireEvent.click(screen.getByRole("button", { name: /pin assertion/i }));

    expect(screen.getByLabelText("Expiry")).toHaveValue("2026-10-13");
    expect(await screen.findByRole("status")).toHaveTextContent("added to replay enforcement");
  });
});
