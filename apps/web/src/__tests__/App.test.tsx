import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("Meridian console", () => {
  it("renders a governed workflow view and allows inspecting another run", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("heading", { name: "Make operational change auditable by default." })).toBeInTheDocument();
    expect(screen.getByText("Awaiting approval")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ledger reconciliation/i }));

    const detail = screen.getByLabelText("Selected run detail");
    expect(within(detail).getByRole("heading", { name: "Ledger reconciliation" })).toBeInTheDocument();
    expect(within(detail).getByText("ledger-2026-08-09")).toBeInTheDocument();
  });
});
