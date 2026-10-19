import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { upsertGoogleUser } from "@/lib/users";

function googleId() {
  return (
    process.env.AUTH_GOOGLE_ID?.trim() ||
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    ""
  );
}

function googleSecret() {
  return (
    process.env.AUTH_GOOGLE_SECRET?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    ""
  );
}

function authSecret() {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    ""
  );
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(googleId() && googleSecret() && authSecret());
}

const providers =
  googleId() && googleSecret()
    ? [
        Google({
          clientId: googleId(),
          clientSecret: googleSecret(),
        }),
      ]
    : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret() || undefined,
  providers,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/",
    error: "/",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider !== "google") return false;
      if (!user.email) return false;
      // Never block login on Redis — JWT session still works; profile sync is best-effort.
      try {
        await upsertGoogleUser({
          email: user.email,
          name: user.name,
          image: user.image,
          providerAccountId: account.providerAccountId,
        });
      } catch (err) {
        console.error("upsertGoogleUser failed (sign-in continues):", err);
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "google" && account.providerAccountId) {
        token.userId = `google_${account.providerAccountId}`;
      }
      if (profile && "email" in profile && typeof profile.email === "string") {
        token.email = profile.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id =
          typeof token.userId === "string"
            ? token.userId
            : typeof token.sub === "string"
              ? `google_${token.sub}`
              : "";
      }
      return session;
    },
  },
  trustHost: true,
  debug: process.env.NODE_ENV === "development",
});
