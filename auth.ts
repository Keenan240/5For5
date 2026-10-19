import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { upsertGoogleUser } from "@/lib/users";

const googleConfigured =
  Boolean(process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID) &&
  Boolean(process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: googleConfigured
    ? [
        Google({
          clientId:
            process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID!,
          clientSecret:
            process.env.AUTH_GOOGLE_SECRET ||
            process.env.GOOGLE_CLIENT_SECRET!,
        }),
      ]
    : [],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider !== "google") return false;
      if (!user.email) return false;
      try {
        await upsertGoogleUser({
          email: user.email,
          name: user.name,
          image: user.image,
          providerAccountId: account.providerAccountId,
        });
        return true;
      } catch (err) {
        console.error("upsertGoogleUser failed:", err);
        return false;
      }
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
});

export function isGoogleAuthConfigured(): boolean {
  return googleConfigured;
}
