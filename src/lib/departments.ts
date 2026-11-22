import "server-only";
import { database } from "@/lib/db";

/**
 * Former Kenya Airways departments as recorded in the alumni registry, A–Z.
 * Verification compares the department with the registry, so offering exactly
 * these values avoids failed checks caused by spelling. Empty if unavailable,
 * in which case forms fall back to a text field.
 */
export async function kqDepartments(): Promise<string[]> {
  try {
    return (await database().query<{ department: string }>(
      "SELECT DISTINCT btrim(former_kq_department) AS department FROM alumni_registry ORDER BY 1")).rows.map(row => row.department);
  } catch {
    return [];
  }
}
