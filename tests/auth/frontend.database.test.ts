import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyAlumni, pendingRequests, requestAssistance, resolveAssistance, getAssistanceStatus } from "@/lib/verification";
import { parseProfile, saveProfile, getProfile } from "@/lib/profiles";

const shared = vi.hoisted(() => ({ pool: undefined as Pool | undefined, context: undefined as AsyncLocalStorage<string> | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({
  requireSession: async () => {
    const id = shared.context!.getStore();
    if (!id) throw new Error("Unauthenticated");
    return { user: { id } };
  },
  requireAdmin: async () => {
    const id = shared.context!.getStore();
    if (id !== "11111111-1111-1111-1111-111111111111") throw new Error("Forbidden");
    return { user: { id } };
  },
}));
vi.mock("@/lib/db", () => ({ database: () => shared.pool! }));

describe.skipIf(process.env.LUMINA_TEST_DATABASE !== "1")("registry verification on isolated PostgreSQL fixtures", () => {
  const admin = "11111111-1111-1111-1111-111111111111";
  const target = "22222222-2222-2222-2222-222222222222";
  const second = "33333333-3333-3333-3333-333333333333";
  const schema = "registry_test_" + randomUUID().replaceAll("-", "");
  const details = { staffNumber: "SYN-ALUM-001", surname: "Wafula", department: "Safety & Quality", startYear: 2008, endYear: 2016 };
  let control: Pool;
  const as = <T,>(id: string, work: () => T) => shared.context!.run(id, work);
  const account = async (id = target) => (await shared.pool!.query("SELECT to_jsonb(u) AS value FROM users u WHERE id=$1", [id])).rows[0].value;

  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url?.hostname || process.env.POSTGRES_HOST || "localhost")
      || (url ? url.pathname.slice(1) : process.env.POSTGRES_DB) !== "lumina") throw new Error("Local lumina database required");
    const config = url ? { connectionString: process.env.DATABASE_URL } : {
      host: process.env.POSTGRES_HOST || "localhost", port: Number(process.env.POSTGRES_PORT || "5432"),
      user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB,
    };
    control = new Pool(config);
    if (!/^registry_test_[a-f0-9]{32}$/.test(schema)) throw new Error("Invalid test namespace");
    await control.query(`CREATE SCHEMA ${schema}`);
    shared.pool = new Pool({ ...config, options: `-c search_path=${schema}`, max: 4 });
    shared.context = new AsyncLocalStorage<string>();
    for (const table of ["users", "profiles", "alumni_registry", "verification_assistance_requests", "profile_change_outbox"]) {
      await shared.pool.query(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
    }
    // LIKE copies checks and unique indexes, but PostgreSQL does not copy foreign keys.
    await shared.pool.query("ALTER TABLE alumni_registry ADD FOREIGN KEY (claimed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT");
    await shared.pool.query("ALTER TABLE verification_assistance_requests ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT, ADD FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE RESTRICT");
  });
  afterAll(async () => {
    await shared.pool?.end();
    if (control) {
      if (!/^registry_test_[a-f0-9]{32}$/.test(schema)) throw new Error("Invalid cleanup namespace");
      await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await control.end();
    }
  });
  beforeEach(async () => {
    await shared.pool!.query("TRUNCATE verification_assistance_requests, alumni_registry, profiles, users");
    await shared.pool!.query(`INSERT INTO users (id,email,role,account_status,google_subject)
      VALUES ($1,'admin@fixture.test','admin','active','admin-sub'),
      ($2,'alumni@fixture.test','alumni','pending','alumni-sub'),
      ($3,'second@fixture.test','alumni','pending','second-sub')`, [admin,target,second]);
    await shared.pool!.query(`INSERT INTO alumni_registry (synthetic_staff_number,surname,former_kq_department,kq_start_year,kq_end_year)
      VALUES ('SYN-ALUM-001','Wafula','Safety & Quality',2008,2016),('SYN-ALUM-002','Mutua','Cabin Services',2013,2017)`);
  });

  it("leaves mismatched accounts untouched and creates no routine admin work", async () => {
    const before = await account();
    for (const change of [{ staffNumber: "SYN-ALUM-999" }, { surname: "Other" }, { department: "Finance" }, { startYear: 2009 }, { endYear: 2017 }]) {
      expect(await as(target, () => verifyAlumni({ ...details, ...change }))).toBe("unresolved");
    }
    expect(await account()).toEqual(before);
    expect(await as(admin, pendingRequests)).toEqual([]);
    expect((await shared.pool!.query("SELECT * FROM alumni_registry WHERE claimed_by_user_id IS NOT NULL")).rows).toEqual([]);
  });
  it("automatically claims and activates; preserves Google identity, role and profile", async () => {
    const data = new FormData(); data.set("full_name", "Fixture Alumni"); data.set("former_kq_role", "Engineer"); data.set("former_kq_department", "Engineering"); data.set("kq_start_year", "2000"); data.set("kq_end_year", "2010");
    await saveProfile(target, parseProfile(data));
    const profile = await getProfile(target);
    expect(await as(target, () => verifyAlumni({ ...details, surname: "  WAFULA ", department: " SAFETY  & QUALITY " }))).toBe("verified");
    expect(await account()).toMatchObject({ account_status: "active", alumni_verified: true, google_subject: "alumni-sub", role: "alumni" });
    expect(await getProfile(target)).toEqual(profile);
    const claim = (await shared.pool!.query("SELECT claimed_by_user_id, claimed_at FROM alumni_registry WHERE synthetic_staff_number='SYN-ALUM-001'")).rows[0];
    expect(claim.claimed_by_user_id).toBe(target); expect(claim.claimed_at).toBeInstanceOf(Date);
    expect(await as(target, () => verifyAlumni(details))).toBe("verified");
    expect((await shared.pool!.query("SELECT claimed_at FROM alumni_registry WHERE synthetic_staff_number='SYN-ALUM-001'")).rows[0].claimed_at).toEqual(claim.claimed_at);
  });
  it("serializes simultaneous claims from different users", async () => {
    const outcomes = await Promise.all([as(target, () => verifyAlumni(details)), as(second, () => verifyAlumni(details))]);
    expect([...outcomes].sort()).toEqual(["unresolved", "verified"]);
    expect((await shared.pool!.query("SELECT id FROM users WHERE alumni_verified")).rows).toHaveLength(1);
    const loser = outcomes[0] === "verified" ? second : target;
    // Both accounts still exist with their Google identities; no attempt suspends either.
    expect((await account(loser)).account_status).not.toBe("suspended");
    expect(await as(admin, pendingRequests)).toEqual([]);
  });
  it("rejects duplicate staff records and a second claim for the same user", async () => {
    await expect(shared.pool!.query("INSERT INTO alumni_registry(synthetic_staff_number,surname,former_kq_department,kq_start_year,kq_end_year) VALUES ('SYN-ALUM-001','Other','Finance',2000,2010)")).rejects.toThrow();
    await as(target, () => verifyAlumni(details));
    expect(await as(second, () => verifyAlumni(details))).toBe("unresolved");
    await expect(shared.pool!.query("UPDATE alumni_registry SET claimed_by_user_id=$1, claimed_at=now() WHERE synthetic_staff_number='SYN-ALUM-002'", [target])).rejects.toThrow();
    await expect(shared.pool!.query("DELETE FROM users WHERE id=$1", [target])).rejects.toThrow();
  });
  it("queues explicit assistance once, closes safely, and allows reopening", async () => {
    const before = await account();
    expect(await as(target, requestAssistance)).toBe(true);
    const first = await as(target, getAssistanceStatus);
    expect(await as(target, requestAssistance)).toBe(true);
    expect(await as(target, getAssistanceStatus)).toEqual(first);
    expect(await as(admin, pendingRequests)).toHaveLength(1);
    expect(await as(admin, () => resolveAssistance(target,"closed_unresolved"))).toBe(true);
    expect(await account()).toEqual(before);
    expect(await as(target, getAssistanceStatus)).toMatchObject({ resolution_outcome: "closed_unresolved" });
    expect(await as(admin, pendingRequests)).toEqual([]);
    expect(await as(admin, () => resolveAssistance(target,"verified","SYN-ALUM-001"))).toBe(false);
    await as(target, requestAssistance);
    expect(await as(target, getAssistanceStatus)).toMatchObject({ resolution_outcome: null });
  });
  it("resolves exceptions with an available record and records the admin outcome", async () => {
    await as(target, requestAssistance);
    expect(await as(admin, () => resolveAssistance(target,"verified","SYN-ALUM-001"))).toBe(true);
    expect(await account()).toMatchObject({ account_status: "active", alumni_verified: true });
    expect((await shared.pool!.query("SELECT resolved_by_user_id,resolved_at,resolution_outcome FROM verification_assistance_requests WHERE user_id=$1",[target])).rows[0]).toMatchObject({ resolved_by_user_id: admin, resolution_outcome: "verified", resolved_at: expect.any(Date) });
    await as(second, requestAssistance);
    expect(await as(admin, () => resolveAssistance(second,"verified","SYN-ALUM-001"))).toBe(false);
    expect(await account(second)).toMatchObject({ account_status: "pending", alumni_verified: false });
    expect(await as(admin, pendingRequests)).toHaveLength(1);
  });
  it("successful self-service retries resolve existing assistance without an admin", async () => {
    await as(target, requestAssistance);
    await as(target, () => verifyAlumni(details));
    expect(await as(admin, pendingRequests)).toEqual([]);
    expect((await shared.pool!.query("SELECT resolution_outcome,resolved_by_user_id FROM verification_assistance_requests WHERE user_id=$1",[target])).rows[0]).toEqual({ resolution_outcome: "verified", resolved_by_user_id: target });
  });
  it("enforces resolution and claim consistency checks", async () => {
    await as(target, requestAssistance);
    for (const change of ["resolved_at=now()", "resolved_by_user_id='" + admin + "'", "resolution_outcome='verified'", "resolution_outcome='rejected'"]) {
      await expect(shared.pool!.query(`UPDATE verification_assistance_requests SET ${change} WHERE user_id=$1`,[target])).rejects.toThrow();
    }
    await expect(shared.pool!.query("UPDATE alumni_registry SET claimed_at=now() WHERE synthetic_staff_number='SYN-ALUM-001'")).rejects.toThrow();
  });
  it("requires authentication, admin authorization and a fresh database role", async () => {
    await expect(verifyAlumni(details)).rejects.toThrow("Unauthenticated");
    await expect(as(target, pendingRequests)).rejects.toThrow("Forbidden");
    await expect(as(target, () => resolveAssistance(target,"closed_unresolved"))).rejects.toThrow("Forbidden");
    await as(target, requestAssistance);
    await shared.pool!.query("UPDATE users SET role='alumni' WHERE id=$1",[admin]);
    await expect(as(admin, () => resolveAssistance(target,"closed_unresolved"))).rejects.toThrow("Administrator required");
  });
  it("does not reactivate suspended or unlinked accounts or change legacy verified users", async () => {
    await shared.pool!.query("UPDATE users SET account_status='suspended' WHERE id=$1",[target]);
    expect(await as(target, () => verifyAlumni(details))).toBe("unresolved");
    await shared.pool!.query("UPDATE users SET account_status='active',google_subject=NULL WHERE id=$1",[target]);
    expect(await as(target, () => verifyAlumni(details))).toBe("unresolved");
    await shared.pool!.query("UPDATE users SET google_subject='alumni-sub',alumni_verified=true WHERE id=$1",[target]);
    const before = await account();
    expect(await as(target, () => verifyAlumni(details))).toBe("verified");
    expect(await account()).toEqual(before);
    expect((await shared.pool!.query("SELECT id FROM alumni_registry WHERE claimed_by_user_id IS NOT NULL")).rows).toHaveLength(0);
  });
  it("rolls back the registry claim if account activation fails", async () => {
    await shared.pool!.query(`CREATE FUNCTION fail_activation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test activation failure'; END $$`);
    await shared.pool!.query("CREATE TRIGGER fail_activation BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fail_activation()");
    try {
      await expect(as(target, () => verifyAlumni(details))).rejects.toThrow("test activation failure");
      expect(await account()).toMatchObject({ account_status: "pending", alumni_verified: false });
      expect((await shared.pool!.query("SELECT id FROM alumni_registry WHERE claimed_by_user_id IS NOT NULL")).rows).toHaveLength(0);
    } finally {
      await shared.pool!.query("DROP TRIGGER fail_activation ON users");
      await shared.pool!.query("DROP FUNCTION fail_activation()");
    }
  });
});
