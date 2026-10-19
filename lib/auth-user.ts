import { auth, isGoogleAuthConfigured } from "@/auth";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id?.trim();
  if (!id) return null;
  return {
    id,
    name: session?.user?.name,
    email: session?.user?.email,
    image: session?.user?.image,
  };
}

/** Require a signed-in user for write APIs. */
export async function requireSessionUser(): Promise<
  | { ok: true; user: SessionUser }
  | { ok: false; response: Response }
> {
  if (!isGoogleAuthConfigured()) {
    // Local / pre-auth: treat as single shared account (legacy key).
    return {
      ok: true,
      user: { id: "local", name: "Local", email: null, image: null },
    };
  }
  const user = await getSessionUser();
  if (!user) {
    return {
      ok: false,
      response: Response.json(
        { error: "Sign in with Google to save parlays." },
        { status: 401 }
      ),
    };
  }
  return { ok: true, user };
}

export { isGoogleAuthConfigured };
