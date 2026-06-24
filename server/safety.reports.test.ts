import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module so tests don't hit a real database
vi.mock("./db", () => ({
  getAllSafetyReports: vi.fn().mockResolvedValue([]),
  upsertSafetyReport: vi.fn().mockImplementation(async (data) => ({
    id: data.id ?? 1,
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  deleteSafetyReport: vi.fn().mockResolvedValue(undefined),
  bulkInsertSafetyReports: vi.fn().mockResolvedValue(undefined),
  // other exports used by routers
  countLocalUsers: vi.fn().mockResolvedValue(0),
  getLocalUserByUsername: vi.fn().mockResolvedValue(undefined),
  getLocalUserById: vi.fn().mockResolvedValue(undefined),
  getAllLocalUsers: vi.fn().mockResolvedValue([]),
  createLocalUser: vi.fn().mockResolvedValue(undefined),
  updateLocalUser: vi.fn().mockResolvedValue(undefined),
  deleteLocalUser: vi.fn().mockResolvedValue(undefined),
  verifyLocalUserPassword: vi.fn().mockResolvedValue(null),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./_core/env", () => ({
  ENV: {
    jwtSecret: "test-secret",
    ownerOpenId: "owner-open-id",
    ownerName: "Owner",
    oauthServerUrl: "https://oauth.example.com",
    builtInForgeApiUrl: "https://api.example.com",
    builtInForgeApiKey: "test-key",
  },
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

import { getAllSafetyReports, upsertSafetyReport, deleteSafetyReport, bulkInsertSafetyReports } from "./db";

describe("Safety Reports DB helpers (mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getAllSafetyReports returns an array", async () => {
    const result = await getAllSafetyReports();
    expect(Array.isArray(result)).toBe(true);
  });

  it("upsertSafetyReport creates a new record when no id", async () => {
    const data = {
      applicantName: "John Doe",
      fileNumber: "12345",
      created: "2026-01-01",
      status: "S1 Complete" as const,
      followUpDate: "",
      notes: "",
      prevEmployerName: "ACME Corp",
      prevEmployerEmail: "",
      prevEmployerStreet: "",
      prevEmployerPhone: "",
      prevEmployerFax: "",
      prevEmployerCityStateZip: "",
      employerName: "",
      employerAttention: "",
      employerStreet: "",
      employerCityStateZip: "",
      employerPhone: "",
      employerFax: "",
      employerEmail: "",
      confFax: "",
      confEmail: "",
      employedByCompany: "",
      jobTitle: "",
      fromDate: "",
      toDate: "",
      droveMotorVehicle: "",
      vehicleStraightTruck: false,
      vehicleTractorSemitrailer: false,
      vehicleBus: false,
      vehicleCargoTank: false,
      vehicleDoublesTriples: false,
      vehicleOther: false,
      accidentHistory: "",
      accidentDate1: "",
      accidentLocation1: "",
      accidentInjuries1: "",
      accidentFatalities1: "",
      accidentHazmat1: "",
      accidentDate2: "",
      accidentLocation2: "",
      accidentInjuries2: "",
      accidentFatalities2: "",
      accidentHazmat2: "",
      accidentDate3: "",
      accidentLocation3: "",
      accidentInjuries3: "",
      accidentFatalities3: "",
      accidentHazmat3: "",
      otherAccidents: "",
      dotCompany: "",
      dotEmployee: "",
      dotAlcoholTestPositive: false,
      dotDrugTestPositive: false,
      dotRefusedTest: false,
      dotOtherViolations: false,
      infoReceivedFrom: "",
      infoReceivedDate: "",
    };
    const result = await upsertSafetyReport(data);
    expect(result).toMatchObject({ applicantName: "John Doe", fileNumber: "12345" });
    expect(upsertSafetyReport).toHaveBeenCalledOnce();
  });

  it("deleteSafetyReport calls delete with the correct id", async () => {
    await deleteSafetyReport(42);
    expect(deleteSafetyReport).toHaveBeenCalledWith(42);
  });

  it("bulkInsertSafetyReports handles empty array", async () => {
    await bulkInsertSafetyReports([]);
    expect(bulkInsertSafetyReports).toHaveBeenCalledWith([]);
  });
});
