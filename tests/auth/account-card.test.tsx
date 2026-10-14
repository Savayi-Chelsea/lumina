import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AccountCard } from "@/components/account-card";
import { GoogleSignInButton, SignOutButton } from "@/components/auth-controls";

vi.mock("@/app/auth-actions", () => ({ googleSignIn: vi.fn(), logOut: vi.fn() }));

describe("account UI", () => {
  it("shows Google account information without implying alumni verification", () => {
    const html = renderToStaticMarkup(<AccountCard user={{
      name: "Google User", email: "personal@gmail.com",
      image: "https://lh3.googleusercontent.com/example", alumniVerified: false,
    }} />);
    expect(html).toContain("Google User");
    expect(html).toContain("personal@gmail.com");
    expect(html).toContain("Google profile photo");
    expect(html).toContain("Not verified");
    expect(html).toContain("handled separately by Lumina");
  });

  it("handles missing optional name and image", () => {
    const html = renderToStaticMarkup(<AccountCard user={{ alumniVerified: false }} />);
    expect(html).toContain("Your Google account");
    expect(html).not.toContain("<img");
  });

  it("shows verification only when explicitly supplied by Lumina", () => {
    const html = renderToStaticMarkup(<AccountCard user={{ alumniVerified: true }} />);
    expect(html).toContain("Verified by Lumina");
  });

  it("escapes account information", () => {
    const html = renderToStaticMarkup(<AccountCard user={{ name: "<script>secret</script>", alumniVerified: false }} />);
    expect(html).not.toContain("<script>secret</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("offers sign in and disables it when unconfigured", () => {
    expect(renderToStaticMarkup(<GoogleSignInButton />)).toContain("Continue with Google");
    expect(renderToStaticMarkup(<GoogleSignInButton disabled />)).toContain("disabled");
  });

  it("offers sign out", () => {
    expect(renderToStaticMarkup(<SignOutButton />)).toContain("Sign out");
  });
});
