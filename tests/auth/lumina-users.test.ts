import { beforeEach, describe, expect, it, vi } from "vitest";
import { findLuminaUser, IdentityLinkRequired, linkGoogleUser } from "@/lib/lumina-users";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn(), release: vi.fn(), poolQuery: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ database: () => ({ connect: mocks.connect, query: mocks.poolQuery }) }));
const user = { id: "lumina-id", role: "alumni", account_status: "active", alumni_verified: false };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.query.mockResolvedValue({ rows: [] });
});

describe("existing Lumina user linkage", () => {
  it("reuses a subject-linked user without changing their account or profile", async () => {
    mocks.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [user] });
    expect(await linkGoogleUser("stable-subject", "changed@gmail.com")).toEqual(user);
    expect(mocks.query.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/.test(sql))).toBe(false);
    expect(mocks.query).toHaveBeenCalledWith("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("creates a pending, unverified account using bound parameters", async () => {
    mocks.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...user, account_status: "pending" }] });
    await linkGoogleUser("stable-subject", "personal@gmail.com");
    const [sql, values] = mocks.query.mock.calls[2];
    expect(sql).toContain("NULL, 'alumni', 'pending', TRUE, $2, FALSE");
    expect(values).toEqual(["personal@gmail.com", "stable-subject"]);
    expect(sql).not.toContain("personal@gmail.com");
    expect(sql).not.toContain("profiles");
  });

  it("refuses to take over an existing account by matching email", async () => {
    await expect(linkGoogleUser("new-subject", "existing@gmail.com")).rejects.toBeInstanceOf(IdentityLinkRequired);
    expect(mocks.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
  });

  it("handles concurrent insertion of the same subject", async () => {
    mocks.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [user] });
    expect(await linkGoogleUser("stable-subject", "personal@gmail.com")).toEqual(user);
  });

  it("rejects suspended accounts and releases the connection", async () => {
    mocks.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ ...user, account_status: "suspended" }] });
    await expect(linkGoogleUser("stable-subject", "personal@gmail.com")).rejects.toThrow("Account unavailable");
    expect(mocks.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("reads only safe account fields by Lumina UUID", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [user] });
    expect(await findLuminaUser(user.id)).toEqual(user);
    const [sql, values] = mocks.poolQuery.mock.calls[0];
    expect(sql).not.toContain("password_hash");
    expect(values).toEqual([user.id]);
  });
});
