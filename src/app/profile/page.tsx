"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  linkWithPopup,
  unlink,
  fetchSignInMethodsForEmail,
} from "firebase/auth";
import { useTheme } from "next-themes";

import { auth, googleProvider } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { User2, LinkIcon, UnlinkIcon, LogOut, ShieldCheck, MailCheck, Moon, Sun, Building2, Wallet, RefreshCw } from "lucide-react";
import { useUserRole } from "@/lib/hooks/useUserRole";
import { CompanyProfileForm } from "@/components/company-profile-form";
import { WalletInfo } from "@/components/wallet/WalletInfo";
import { useWallet } from "@/lib/hooks/useWallet";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/db";

const profileSchema = z.object({
  name: z.string().min(2, "Name is too short").max(50, "Name is too long"),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState(auth.currentUser);
  const [loading, setLoading] = useState(true);
  const [googleLinked, setGoogleLinked] = useState(false);
  const { isIssuer, profileComplete } = useUserRole();
  const { isConnected, accountId, network } = useWallet();
  const [isSyncing, setIsSyncing] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.displayName ?? "" },
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/auth");
        return;
      }
      setUser(u);
      form.reset({ name: u.displayName ?? "" });
      const providers = u.providerData.map((p) => p.providerId);
      setGoogleLinked(providers.includes("google.com"));
      setLoading(false);
    });
    return () => unsub();
  }, [router, form]);

  const initials = useMemo(() => {
    const n = user?.displayName || user?.email || "N";
    const parts = n.split("@")[0].split(" ");
    return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "N";
  }, [user]);

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="text-sm text-muted-foreground">Loading profile...</div>
      </main>
    );
  }

  const handleSave = async (values: ProfileFormValues) => {
    if (!auth.currentUser) return;
    const t = toast.loading("Saving profile...");
    try {
      await updateProfile(auth.currentUser, { displayName: values.name.trim() });
      toast.success("Profile updated", { id: t });
      setUser({ ...auth.currentUser });
    } catch (err: any) {
      toast.error("Unable to update profile", { id: t });
    }
  };

  const handleResetPassword = async () => {
    if (!user?.email) return toast.info("No email on account");
    const methods = await fetchSignInMethodsForEmail(auth, user.email);
    if (!methods.includes("password")) {
      return toast.info("Password reset not available for Google-only accounts");
    }
    const t = toast.loading("Sending reset email...");
    try {
      await sendPasswordResetEmail(auth, user.email);
      toast.success("Password reset email sent", { id: t });
    } catch {
      toast.error("Failed to send reset email", { id: t });
    }
  };

  const handleVerifyEmail = async () => {
    if (!auth.currentUser) return;
    const t = toast.loading("Sending verification email...");
    try {
      await sendEmailVerification(auth.currentUser);
      toast.success("Verification email sent", { id: t });
    } catch {
      toast.error("Failed to send verification", { id: t });
    }
  };

  const handleLinkGoogle = async () => {
    if (!auth.currentUser) return;
    const t = toast.loading("Linking Google account...");
    try {
      await linkWithPopup(auth.currentUser, googleProvider);
      setGoogleLinked(true);
      toast.success("Google account linked", { id: t });
    } catch (e: any) {
      toast.error("Failed to link Google", { id: t });
    }
  };

  const handleUnlinkGoogle = async () => {
    if (!auth.currentUser) return;
    // Avoid unlink if it is the only provider
    if ((auth.currentUser.providerData || []).length <= 1) {
      return toast.info("Add another sign-in method before unlinking");
    }
    const t = toast.loading("Unlinking Google...");
    try {
      await unlink(auth.currentUser, "google.com");
      setGoogleLinked(false);
      toast.success("Google unlinked", { id: t });
    } catch {
      toast.error("Failed to unlink", { id: t });
    }
  };

  const handleSignOut = async () => {
    const t = toast.loading("Signing out...");
    try {
      await auth.signOut();
      toast.success("Signed out", { id: t });
      router.replace("/auth");
    } catch {
      toast.error("Failed to sign out", { id: t });
    }
  };

  const handleSyncWallet = async () => {
    if (!auth.currentUser) {
      toast.error("Please sign in to sync wallet");
      return;
    }

    if (!isConnected || !accountId) {
      toast.error("Please connect your wallet first");
      return;
    }

    setIsSyncing(true);
    const t = toast.loading("Syncing wallet address...");
    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      await setDoc(userRef, {
        walletAddress: accountId,
        walletPairedAt: serverTimestamp(),
        walletNetwork: network,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast.success("Wallet address synced to profile", { id: t });
    } catch (error) {
      console.error("Failed to sync wallet address:", error);
      toast.error("Failed to sync wallet address", { id: t });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <div className="grid size-12 place-items-center rounded-full border bg-card text-sm font-medium">
            {initials}
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Account info */}
        <section className="rounded-xl border bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-medium">Account</h2>
          <form className="mt-4 grid gap-4" onSubmit={form.handleSubmit(handleSave)} noValidate>
            <div className="grid gap-1.5">
              <label htmlFor="name" className="text-sm font-medium">Display name</label>
              <Input id="name" placeholder="Your name" {...form.register("name")} aria-invalid={!!form.formState.errors.name} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Email</label>
              <Input value={user?.email ?? ""} disabled />
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={form.formState.isSubmitting}>Save changes</Button>
            </div>
          </form>
        </section>

        {/* Security */}
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-medium">Security</h2>
          <div className="mt-3 grid gap-2">
            <Button variant="outline" onClick={handleResetPassword}>
              <ShieldCheck className="size-4" /> Reset password
            </Button>
            {!user?.emailVerified && (
              <Button variant="outline" onClick={handleVerifyEmail}>
                <MailCheck className="size-4" /> Verify email
              </Button>
            )}
          </div>
        </section>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Connected accounts */}
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-medium">Connected accounts</h2>
          <div className="mt-3 grid gap-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Google</div>
                <div className="text-xs text-muted-foreground">Use your Google account to sign in</div>
              </div>
              {googleLinked ? (
                <Button variant="outline" onClick={handleUnlinkGoogle}>
                  <UnlinkIcon className="size-4" /> Unlink
                </Button>
              ) : (
                <Button variant="outline" onClick={handleLinkGoogle}>
                  <LinkIcon className="size-4" /> Link
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* Preferences */}
        <section className="rounded-xl border bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-medium">Preferences</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <div className="text-sm font-medium">Theme</div>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  variant={theme === "light" ? "secondary" : "outline"}
                  onClick={() => setTheme("light")}
                >
                  <Sun className="size-4" /> Light
                </Button>
                <Button
                  variant={theme === "dark" ? "secondary" : "outline"}
                  onClick={() => setTheme("dark")}
                >
                  <Moon className="size-4" /> Dark
                </Button>
                <Button
                  variant={theme === "system" ? "secondary" : "outline"}
                  onClick={() => setTheme("system")}
                >
                  System
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Hedera Wallet Section */}
      <section className="mt-4 rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wallet className="size-5 text-primary" />
            <h2 className="text-sm font-medium">Hedera Wallet</h2>
          </div>
          {isConnected && accountId && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncWallet}
              disabled={isSyncing}
            >
              <RefreshCw className={`size-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing..." : "Sync Wallet"}
            </Button>
          )}
        </div>
        {isConnected ? (
          <WalletInfo />
        ) : (
          <div className="text-center py-6">
            <Wallet className="mx-auto size-12 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              Connect your HashPack wallet to {isIssuer ? "issue bonds" : "invest in bonds"}
            </p>
            <p className="text-xs text-muted-foreground">
              Use the "Connect Wallet" button in the navigation bar
            </p>
          </div>
        )}
      </section>

      {/* Company Profile Section - Only for Issuers */}
      {isIssuer && (
        <section className="mt-6 rounded-xl border bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <Building2 className="size-6 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Company Profile</h2>
              <p className="text-sm text-muted-foreground">
                {profileComplete
                  ? "Your company profile is complete"
                  : "Complete your company profile to start issuing bonds"}
              </p>
            </div>
          </div>
          {user && <CompanyProfileForm userId={user.uid} />}
        </section>
      )}
    </main>
  );
}


