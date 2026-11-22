import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getProfile } from "@/lib/profiles";
import { kqDepartments } from "@/lib/departments";
import { listExperience, listSkills, ownProfileId, SKILL_LIMIT } from "@/lib/profile-editor";
import { CvImport } from "@/components/cv-import";
import { EditNav } from "@/components/profile-edit-nav";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

export default async function CvImportPage() {
  const session = await requireSession();
  const profileId = await ownProfileId(session.user.id);
  if (!profileId) redirect("/profile/edit");
  const [profile, experience, skills, departments] = await Promise.all([getProfile(session.user.id), listExperience(profileId), listSkills(profileId), kqDepartments()]);
  const current = {
    headline: profile?.headline, current_job_title: profile?.current_job_title, current_organization: profile?.current_organization,
    industry: profile?.industry, location: profile?.location, biography: profile?.biography,
    former_kq_role: profile?.former_kq_role, former_kq_department: profile?.former_kq_department,
    kq_start_year: profile?.kq_start_year ?? null, kq_end_year: profile?.kq_end_year ?? null,
  };
  return <>
    <Link className="text-link back-link" href="/profile"><Icon name="arrow" className="flip" />Back to your profile</Link>
    <p className="eyebrow">Your professional story</p><h1>Fill in from your CV</h1>
    <EditNav current="/profile/edit/cv" />
    <p className="detail-summary">Pick your CV and Lumina suggests your headline, roles, skills and Kenya Airways chapter. You check everything before it is saved.</p>
    <CvImport current={current} skillLimit={SKILL_LIMIT} departments={departments}
      existingRoles={experience.map(entry => `${entry.job_title.toLowerCase()}|${entry.organization.toLowerCase()}|${entry.start_date?.slice(0, 7) ?? ""}`)}
      existingSkills={skills.map(skill => skill.name)} />
  </>;
}
