"""Create or update .env for local Linux/macOS and GitHub Codespaces development.

  python3 scripts/setup_env.py           # safe to run any number of times

What it does (and nothing else):
  * creates .env from .env.example when it is missing, and appends any setting
    that .env.example has gained since your .env was created;
  * replaces the AUTH_SECRET placeholder with a random secret;
  * blanks the Google OAuth placeholders, so the Google button reports
    "unavailable" instead of sending people to Google with a fake client id;
  * inside GitHub Codespaces, configures the app for port forwarding:
    SERVER_ACTIONS_ALLOWED_ORIGINS=localhost:3000 (the Codespaces proxy rewrites
    the browser's Origin header to http://localhost:3000, which Next.js would
    otherwise reject on every form submission), AUTH_TRUST_HOST=true and no fixed
    AUTH_URL (Auth.js then builds its callback URL from the forwarded host, so
    both the *.app.github.dev address and VS Code's localhost forwarding work).

It never overwrites a real value you have set. Keep real secrets as Codespaces
secrets (AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, JSEARCH_API_KEY): they
arrive as environment variables, which take precedence over .env for Next.js,
the Python scripts and Docker Compose, so they never need to be written to disk.
Secret values are never printed.
"""
import os
import re
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV, EXAMPLE = ROOT / ".env", ROOT / ".env.example"
PLACEHOLDERS = {
    "AUTH_SECRET": "replace_with_a_random_secret_at_least_32_characters_long",
    "AUTH_GOOGLE_ID": "replace_with_google_oauth_client_id",
    "AUTH_GOOGLE_SECRET": "replace_with_google_oauth_client_secret",
}
ASSIGNMENT = re.compile(r"^([A-Z][A-Z0-9_]*)=(.*)$")


def assignments(lines):
    """Map each active KEY to the index of its last assignment line."""
    found = {}
    for index, line in enumerate(lines):
        if match := ASSIGNMENT.match(line):
            found[match.group(1)] = index
    return found


def value_of(lines, key):
    index = assignments(lines).get(key)
    return None if index is None else ASSIGNMENT.match(lines[index]).group(2).strip().strip('"')


def set_value(lines, key, value, note=None):
    """Replace the active assignment of key, or append one. Returns True when changed."""
    index = assignments(lines).get(key)
    line = f"{key}={value}"
    if index is not None:
        if lines[index] == line:
            return False
        lines[index] = line
        return True
    if note:
        lines.append(f"# {note}")
    lines.append(line)
    return True


def comment_out(lines, key, note):
    index = assignments(lines).get(key)
    if index is None:
        return False
    lines[index] = f"# {lines[index]}  # {note}"
    return True


def main():
    quiet = "--quiet" in sys.argv
    changes = []
    if not ENV.exists():
        ENV.write_text(EXAMPLE.read_text(encoding="utf-8"), encoding="utf-8")
        changes.append("created .env from .env.example")
    lines = ENV.read_text(encoding="utf-8").splitlines()
    example = EXAMPLE.read_text(encoding="utf-8").splitlines()

    # Settings added to .env.example after this .env was created.
    present = set(assignments(lines)) | {m.group(1) for line in lines if (m := re.match(r"^#\s*([A-Z][A-Z0-9_]*)=", line))}
    for line in example:
        if (match := ASSIGNMENT.match(line)) and match.group(1) not in present:
            lines.append(line)
            changes.append(f"added {match.group(1)} from .env.example")

    current = value_of(lines, "AUTH_SECRET") or ""
    if current in ("", PLACEHOLDERS["AUTH_SECRET"]) or len(current) < 32:
        set_value(lines, "AUTH_SECRET", secrets.token_hex(32))
        changes.append("generated AUTH_SECRET")
    for key in ("AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"):
        if value_of(lines, key) == PLACEHOLDERS[key]:
            set_value(lines, key, "")
            changes.append(f"blanked placeholder {key}")

    codespace = os.getenv("CODESPACES") == "true" and os.getenv("CODESPACE_NAME")
    if codespace:
        domain = os.getenv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", "app.github.dev")
        if set_value(lines, "SERVER_ACTIONS_ALLOWED_ORIGINS", "localhost:3000",
                     "Codespaces: the port-forwarding proxy rewrites Origin to localhost:3000"):
            changes.append("set SERVER_ACTIONS_ALLOWED_ORIGINS=localhost:3000")
        if set_value(lines, "AUTH_TRUST_HOST", "true", "Codespaces: build Auth.js URLs from the forwarded host"):
            changes.append("set AUTH_TRUST_HOST=true")
        if comment_out(lines, "AUTH_URL", "disabled in Codespaces; AUTH_TRUST_HOST derives it"):
            changes.append("commented out AUTH_URL")
        if (value_of(lines, "APP_ORIGIN") or "") != "http://localhost:3000":
            set_value(lines, "APP_ORIGIN", "http://localhost:3000")
            changes.append("set APP_ORIGIN=http://localhost:3000")

    ENV.write_text("\n".join(lines) + "\n", encoding="utf-8")
    if quiet:
        return
    print("\n".join(f"  - {change}" for change in changes) or "  .env already up to date")
    google = all(os.getenv(k) or value_of(lines, k) for k in ("AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"))
    print(f"Google sign-in: {'configured' if google else 'not configured (email/password sign-in still works)'}")
    jobs = "JSearch + Himalayas" if (os.getenv("JSEARCH_API_KEY") or value_of(lines, "JSEARCH_API_KEY")) else "Himalayas only (add JSEARCH_API_KEY for on-site Kenyan listings)"
    print(f"Kenya job feed: {jobs}")
    if codespace:
        public = f"https://{os.environ['CODESPACE_NAME']}-3000.{domain}"
        print(f"Open the app at {public} (or http://localhost:3000 from VS Code desktop).")
        print("Google Cloud Console > OAuth client > Authorized redirect URIs, add both:")
        print(f"  {public}/api/auth/callback/google")
        print("  http://localhost:3000/api/auth/callback/google")


if __name__ == "__main__":
    main()
