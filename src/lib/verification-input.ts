export type VerificationDetails = {
  staffNumber: string;
  surname: string;
  department: string;
  startYear: number;
  endYear: number;
};

export function normalizedText(value: string) {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en");
}

export function staffNumber(value: unknown): string {
  if (typeof value !== "string") throw new Error("Enter your synthetic staff number.");
  const number = value.trim().toUpperCase();
  if (number.length > 40 || !/^SYN-ALUM-[0-9]{3,}$/.test(number)) {
    throw new Error("Use a synthetic staff number such as SYN-ALUM-001.");
  }
  return number;
}

export function parseVerification(data: FormData): VerificationDetails {
  function text(key: string, label: string) {
    const value = data.get(key);
    if (typeof value !== "string" || !value.trim() || value.length > 150) {
      throw new Error(`Enter ${label} using 150 characters or fewer.`);
    }
    return normalizedText(value);
  }
  function year(key: string) {
    const value = data.get(key);
    if (typeof value !== "string" || !/^\d{4}$/.test(value)
      || Number(value) < 1977 || Number(value) > new Date().getFullYear()) {
      throw new Error("Service years must be between 1977 and the current year.");
    }
    return Number(value);
  }
  const result = {
    staffNumber: staffNumber(data.get("staff_number")),
    surname: text("surname", "your surname"),
    department: text("department", "your former KQ department"),
    startYear: year("start_year"),
    endYear: year("end_year"),
  };
  if (result.endYear < result.startYear) throw new Error("End year must be on or after start year.");
  return result;
}
