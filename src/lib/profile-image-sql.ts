// SQL expression for a member's display photo: an uploaded photo wins over the Google picture.
// `profile` and `user` are the table aliases in the calling query.
export function profileImageSql(profile: string, user: string) {
  return `COALESCE((SELECT '/api/profile-photo/' || ph.profile_id || '?v=' || floor(extract(epoch FROM ph.updated_at))::bigint
    FROM profile_photos ph WHERE ph.profile_id = ${profile}.id), ${user}.google_image_url)`;
}
