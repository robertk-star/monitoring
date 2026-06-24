import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock axios to avoid real network calls
vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import axios from "axios";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("data.notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns notes data from the Google Sheet", async () => {
    const mockData = {
      status: "ok",
      data: [
        { fileNumber: "4613", notes: "14299 101", lastUpdated: "2026-04-01T00:00:00.000Z" },
        { fileNumber: "4538", notes: "14148 101", lastUpdated: "2026-04-01T00:00:00.000Z" },
        { fileNumber: "4832", notes: "term 03.27.2026", lastUpdated: "2026-04-01T00:00:00.000Z" },
      ],
    };
    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockData });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.data.notes();

    expect(result.status).toBe("ok");
    expect(result.data).toHaveLength(3);
    expect(result.data[0]).toMatchObject({ fileNumber: "4613", notes: "14299 101" });
  });

  it("handles empty notes response gracefully", async () => {
    const mockData = { status: "ok", data: [] };
    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockData });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.data.notes();

    expect(result.status).toBe("ok");
    expect(result.data).toHaveLength(0);
  });
});

describe("data.updateNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts an upsert action to the Notes sheet", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { status: "ok" } });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.data.updateNote({ fileNumber: "4613", notes: "updated note" });

    expect(result).toEqual({ success: true });
    expect(axios.post).toHaveBeenCalledOnce();

    // Verify the payload contains the upsert action
    const callArgs = vi.mocked(axios.post).mock.calls[0];
    const payload = JSON.parse(callArgs[1] as string);
    expect(payload.action).toBe("upsert");
    expect(payload.fileNumber).toBe("4613");
    expect(payload.notes).toBe("updated note");
  });

  it("posts an upsert with empty string to clear a note", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { status: "ok" } });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.data.updateNote({ fileNumber: "4613", notes: "" });

    expect(result).toEqual({ success: true });
    const callArgs = vi.mocked(axios.post).mock.calls[0];
    const payload = JSON.parse(callArgs[1] as string);
    expect(payload.action).toBe("upsert");
    expect(payload.notes).toBe("");
  });
});
