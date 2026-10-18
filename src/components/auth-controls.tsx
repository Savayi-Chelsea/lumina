import { googleSignIn, logOut } from "@/app/auth-actions";
import { Icon } from "./icon";

export function GoogleSignInButton({ disabled = false }: { disabled?: boolean }) {
  return (
    <form action={googleSignIn}>
      <button type="submit" disabled={disabled}
        className="button google-button">
        <span className="google-monogram" aria-hidden="true">G</span>Continue with Google<Icon name="arrow" />
      </button>
    </form>
  );
}

export function SignOutButton() {
  return (
    <form action={logOut}>
      <button type="submit" className="secondary">
        Sign out
      </button>
    </form>
  );
}
