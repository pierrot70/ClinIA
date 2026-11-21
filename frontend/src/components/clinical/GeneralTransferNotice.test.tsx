import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { UI_LABELS_FR } from "../../i18n/uiLabels.fr";
import { GeneralTransferNotice } from "./GeneralTransferNotice";

const api = vi.hoisted(() => ({ getGeneralTransferNotice: vi.fn() }));
vi.mock("../../services/clinicalCareAccessApi", () => api);
const text = UI_LABELS_FR.patientCareTransfer;
const empty = { overdueCount: 0, nextReminderAt: null, incomingGeneral: false };
const show = () => render(<MemoryRouter><GeneralTransferNotice /></MemoryRouter>);
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });

it("shows the sender a link at 48 hours and removes it after the request is resolved", async () => {
    vi.useFakeTimers();
    const nextReminderAt = new Date(Date.now() + 48 * 3600000).toISOString();
    api.getGeneralTransferNotice.mockResolvedValueOnce({ data: { ...empty, nextReminderAt } })
        .mockResolvedValueOnce({ data: { ...empty, overdueCount: 1 } }).mockResolvedValueOnce({ data: empty });
    await act(async () => { show(); });
    await act(() => vi.advanceTimersByTimeAsync(48 * 3600000 - 1));
    expect(screen.queryByRole("status")).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByRole("status")).toHaveTextContent(text.overdueBanner);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/clinical-care-transfer");
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(screen.queryByRole("status")).toBeNull();
});

it("offers family physicians a link to their inbox when a general invitation is available", async () => {
    api.getGeneralTransferNotice.mockResolvedValue({ data: { ...empty, incomingGeneral: true } });
    show();
    expect(await screen.findByRole("status")).toHaveTextContent(text.incomingGeneralBanner);
    expect(screen.getByRole("link", { name: text.title })).toHaveAttribute("href", "/clinical-care-transfer");
});
