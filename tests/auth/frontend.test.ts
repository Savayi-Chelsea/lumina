import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseProfile } from "@/lib/profiles";
import { resolveAssistance, pendingRequests } from "@/lib/verification";
import { parseVerification, normalizedText } from "@/lib/verification-input";
const mocks = vi.hoisted(() => ({ query: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ database: () => ({ query: mocks.query }) }));
vi.mock("@/lib/session", () => ({ requireAdmin: mocks.requireAdmin }));
beforeEach(() => { vi.resetAllMocks(); mocks.requireAdmin.mockResolvedValue({ user: { id: "actor" } }); mocks.query.mockResolvedValue({ rows: [{ id: "target" }] }); });
const id = "12345678-1234-1234-1234-123456789abc";
describe("profile validation", () => {
 it("requires a name and validates service year ordering", () => { const data = new FormData(); expect(() => parseProfile(data)).toThrow("Full name"); data.set("full_name", "Alumnus"); data.set("kq_start_year", "2020"); data.set("kq_end_year", "2019"); expect(() => parseProfile(data)).toThrow("on or after"); });
 it("rejects excessive values, noninteger and future years", () => { const data = new FormData(); data.set("full_name", "a".repeat(151)); expect(() => parseProfile(data)).toThrow("150"); data.set("full_name", "Alumnus"); for (const year of ["1976", "2020.5", "9999"]) { data.set("kq_start_year", year); expect(() => parseProfile(data)).toThrow("KQ years"); } });
 it("accepts optional fields and trims names", () => { const data = new FormData(); data.set("full_name", " Alumni "); expect(parseProfile(data)).toMatchObject({ full_name: "Alumni", kq_start_year: null }); });
});
describe("verification input and authorization", () => {
 it("normalizes case, whitespace and Unicode without fuzzy matching", () => {
  expect(normalizedText("  ICT  / Digital ")).toBe("ict / digital");
  expect(normalizedText("E\u0301LISE")).toBe(normalizedText("Élise"));
  expect(normalizedText("O'Neil")).not.toBe(normalizedText("ONeil"));
 });
 it("parses all required verification fields", () => {
  const data = new FormData();
  for (const [key,value] of Object.entries({ staff_number: " syn-alum-001 ", surname: " Wafula ", department: " Safety & Quality ", start_year: "2008", end_year: "2016" })) data.set(key,value);
  expect(parseVerification(data)).toEqual({ staffNumber: "SYN-ALUM-001", surname: "wafula", department: "safety & quality", startYear: 2008, endYear: 2016 });
  data.set("end_year","2007"); expect(() => parseVerification(data)).toThrow("on or after");
  data.set("end_year","9999"); expect(() => parseVerification(data)).toThrow("Service years");
  data.set("staff_number","KQ123"); expect(() => parseVerification(data)).toThrow("synthetic staff");
 });
 it("does not accept files, blank surnames or missing fields", () => {
  const data = new FormData(); expect(() => parseVerification(data)).toThrow();
  data.set("staff_number","SYN-ALUM-001"); data.set("surname"," "); expect(() => parseVerification(data)).toThrow("surname");
  data.set("surname",new Blob(["x"]),"name.txt"); expect(() => parseVerification(data)).toThrow("surname");
 });
 it("prevents nonadmins from listing or resolving exceptions", async () => {
  mocks.requireAdmin.mockRejectedValue(new Error("forbidden"));
  await expect(pendingRequests()).rejects.toThrow("forbidden");
  await expect(resolveAssistance(id,"closed_unresolved")).rejects.toThrow("forbidden");
  expect(mocks.query).not.toHaveBeenCalled();
 });
 it("rejects invalid outcomes before opening a transaction", async () => {
  await expect(resolveAssistance(id,"reject")).rejects.toThrow("Invalid resolution");
  expect(mocks.query).not.toHaveBeenCalled();
 });
});
