import { googleSignIn, logOut } from "@/app/auth-actions";

export function GoogleSignInButton({ disabled = false }: { disabled?: boolean }) {
  return (
    <form action={googleSignIn}>
      <button type="submit" disabled={disabled}
        className="rounded-full bg-zinc-900 px-6 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900">
        Continue with Google
      </button>
    </form>
  );
}

export function SignOutButton() {
  return (
    <form action={logOut}>
      <button type="submit" className="rounded-full border border-zinc-300 px-6 py-3 font-medium dark:border-zinc-700">
        Sign out
      </button>
    </form>
  );
}
