"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  onAuthStateChanged,
  sendPasswordResetEmail,
  getAdditionalUserInfo,
} from "firebase/auth";

import { auth, googleProvider } from "@/lib/firebase";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// Tabs removed
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
// Tailwind utilities are imported globally

const emailSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Minimum 6 characters"),
});

type EmailFormValues = z.infer<typeof emailSchema>;

const errorMessageFromCode = (code: string): string => {
  const map: Record<string, string> = {
    "auth/invalid-credential": "Invalid email or password.",
    "auth/user-not-found": "No user found with this email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/email-already-in-use": "Email already in use.",
    "auth/popup-closed-by-user": "Popup closed before completing sign in.",
    "auth/operation-not-allowed": "Operation not allowed in Firebase project.",
    "auth/network-request-failed": "Network error. Please try again.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
  };
  return map[code] ?? "Something went wrong. Please try again.";
};

export default function AuthPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<"signin" | "signup">(
    params.get("tab") === "signup" ? "signup" : "signin"
  );
  // Role selected in Sign Up flow
  const [signupRole, setSignupRole] = useState<"investor" | "issuer">("investor");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) router.push("/");
    });
    return () => unsub();
  }, [router]);

  const signInForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "", password: "" },
    mode: "onTouched",
  });

  const signUpInvestorForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "", password: "" },
    mode: "onTouched",
  });

  // Issuer form merged into a single form via signupRole

  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [pendingUserEmail, setPendingUserEmail] = useState<string | null>(null);

  const getErrorCode = (e: unknown): string => {
    if (typeof e === "object" && e !== null && "code" in e) {
      const rec = e as Record<string, unknown>;
      return typeof rec.code === "string" ? rec.code : "";
    }
    return "";
  };

  const onGoogle = async (selectedRole?: "investor" | "issuer") => {
    try {
      setLoadingGoogle(true);
      const t = toast.loading("Connecting to Google...");
      const cred = await signInWithPopup(auth, googleProvider);
      const user = cred.user;
      const isNew = getAdditionalUserInfo(cred)?.isNewUser === true;
      if (user && isNew) {
        if (!selectedRole) {
          setPendingUserId(user.uid);
          setPendingUserEmail(user.email ?? null);
          setRoleDialogOpen(true);
          toast.dismiss(t);
          return;
        }
        const userRef = doc(db, "users", user.uid);
        await setDoc(userRef, {
          email: user.email ?? "",
          role: selectedRole,
          createdAt: serverTimestamp(),
        }, { merge: true });
      }
      toast.success("Signed in with Google", { id: t });
      router.push("/");
    } catch (err: unknown) {
      toast.error(errorMessageFromCode(getErrorCode(err)));
    } finally {
      setLoadingGoogle(false);
    }
  };

  const onSignIn = async (values: EmailFormValues) => {
    const t = toast.loading("Signing in...");
    try {
      await signInWithEmailAndPassword(auth, values.email, values.password);
      toast.success("Welcome back!", { id: t });
      router.push("/");
    } catch (err: unknown) {
      toast.error(errorMessageFromCode(getErrorCode(err)), { id: t });
    }
  };

  const onSignUp = async (values: EmailFormValues, selectedRole: "investor" | "issuer") => {
    const t = toast.loading("Creating your account...");
    try {
      const cred = await createUserWithEmailAndPassword(auth, values.email, values.password);
      const user = cred.user;
      await setDoc(doc(db, "users", user.uid), {
        email: user.email ?? values.email,
        role: selectedRole,
        createdAt: serverTimestamp(),
      }, { merge: true });
      toast.success("Account created!", { id: t });
      router.push("/");
    } catch (err: unknown) {
      toast.error(errorMessageFromCode(getErrorCode(err)), { id: t });
    }
  };

  return (
    <main className="min-h-svh grid place-items-center px-4">
      <div className="w-full max-w-md rounded-xl border bg-card text-card-foreground shadow-sm p-6 md:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-2 flex items-center justify-center gap-2">
            <div className="grid size-8 place-items-center rounded-md bg-linear-to-r from-primary to-foreground text-primary-foreground text-xs font-semibold shadow-sm">NB</div>
            <span className="text-lg font-semibold tracking-tight">
              <span className="text-foreground">Nano</span>
              <span className="text-primary">Bond</span>
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {tab === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tab === "signin" ? "Sign in to manage your investments" : "Join the future of decentralized micro-financing"}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {tab === "signin" && (
            <div className="mt-4">
              <form className="grid gap-3" onSubmit={signInForm.handleSubmit(onSignIn)} noValidate>
                <div className="grid gap-1.5">
                  <label htmlFor="signin-email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="you@example.com"
                    aria-invalid={!!signInForm.formState.errors.email}
                    {...signInForm.register("email")}
                  />
                  {signInForm.formState.errors.email && (
                    <p className="text-xs text-destructive">
                      {signInForm.formState.errors.email.message}
                    </p>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="signin-password" className="text-sm font-medium">
                      Password
                    </label>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                      onClick={async () => {
                        const email = signInForm.getValues("email");
                        const isValid = z.string().email().safeParse(email).success;
                        if (!isValid) {
                          toast.info("Enter your email to reset password");
                          return;
                        }
                        const t = toast.loading("Sending reset email...");
                        try {
                          await sendPasswordResetEmail(auth, email);
                          toast.success("Password reset email sent", { id: t });
                        } catch (err: unknown) {
                          toast.error(errorMessageFromCode(getErrorCode(err)), { id: t });
                        }
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder="••••••••"
                    aria-invalid={!!signInForm.formState.errors.password}
                    {...signInForm.register("password")}
                  />
                  {signInForm.formState.errors.password && (
                    <p className="text-xs text-destructive">
                      {signInForm.formState.errors.password.message}
                    </p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={signInForm.formState.isSubmitting}>
                  {signInForm.formState.isSubmitting ? "Signing in..." : "Sign In"}
                </Button>
              </form>
              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="outline" type="button" className="w-full">Connect Wallet</Button>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => onGoogle(undefined)}
                    disabled={loadingGoogle}
                    aria-label="Continue with Google"
                    className="w-full"
                  >
                    <Icons.Google className="size-4" /> Google
                  </Button>
                </div>
              </div>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Don&apos;t have an account? {" "}
                <button
                  type="button"
                  className="text-primary underline underline-offset-4"
                  onClick={() => setTab("signup")}
                >
                  Sign up
                </button>
              </p>
            </div>
          )}

          {tab === "signup" && (
            <div className="mt-4">
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <span className="text-sm font-medium">I want to:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={`rounded-lg border p-4 text-left transition-colors ${signupRole === "investor" ? "bg-secondary" : "hover:bg-accent"}`}
                      aria-pressed={signupRole === "investor"}
                      onClick={() => setSignupRole("investor")}
                    >
                      <div className="text-sm font-medium">Invest</div>
                      <div className="text-xs text-muted-foreground">Earn returns</div>
                    </button>
                    <button
                      type="button"
                      className={`rounded-lg border p-4 text-left transition-colors ${signupRole === "issuer" ? "bg-secondary" : "hover:bg-accent"}`}
                      aria-pressed={signupRole === "issuer"}
                      onClick={() => setSignupRole("issuer")}
                    >
                      <div className="text-sm font-medium">Raise Funds</div>
                      <div className="text-xs text-muted-foreground">Issue bonds</div>
                    </button>
                  </div>
                </div>

                <form
                  className="grid gap-3"
                  onSubmit={signUpInvestorForm.handleSubmit((v) => onSignUp(v, signupRole))}
                  noValidate
                >
                  <div className="grid gap-1.5">
                    <label htmlFor="signup-email" className="text-sm font-medium">Email</label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@example.com"
                      aria-invalid={!!signUpInvestorForm.formState.errors.email}
                      {...signUpInvestorForm.register("email")}
                    />
                    {signUpInvestorForm.formState.errors.email && (
                      <p className="text-xs text-destructive">{signUpInvestorForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  <div className="grid gap-1.5">
                    <label htmlFor="signup-password" className="text-sm font-medium">Password</label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="At least 6 characters"
                      aria-invalid={!!signUpInvestorForm.formState.errors.password}
                      {...signUpInvestorForm.register("password")}
                    />
                    {signUpInvestorForm.formState.errors.password && (
                      <p className="text-xs text-destructive">{signUpInvestorForm.formState.errors.password.message}</p>
                    )}
                  </div>
                  <Button type="submit" className="w-full">
                    Create account
                  </Button>
                </form>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="outline" className="w-full" type="button">
                    Connect Wallet
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    type="button"
                    onClick={() => onGoogle(signupRole)}
                    disabled={loadingGoogle}
                    aria-label="Continue with Google"
                  >
                    <Icons.Google className="size-4" /> Google
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Note: Start investing with as little as $10.</p>
                <p className="mt-1 text-center text-sm text-muted-foreground">
                  Already have an account? {" "}
                  <button type="button" className="text-primary underline underline-offset-4" onClick={() => setTab("signin")}>
                    Sign in
                  </button>
                </p>
              </div>
            </div>
          )}
          <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Select your role</DialogTitle>
                <DialogDescription>
                  Choose how you’ll use Nanobond so we can set up your account correctly.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  variant="secondary"
                  onClick={async () => {
                    if (!pendingUserId) return;
                    const t = toast.loading("Saving role...");
                    try {
                      await setDoc(doc(db, "users", pendingUserId), {
                        email: pendingUserEmail ?? "",
                        role: "investor",
                        createdAt: serverTimestamp(),
                      }, { merge: true });
                      toast.success("Role saved", { id: t });
                      setRoleDialogOpen(false);
                      router.push("/");
                    } catch {
                      toast.error("Failed to save role", { id: t });
                    }
                  }}
                >
                  Investor
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!pendingUserId) return;
                    const t = toast.loading("Saving role...");
                    try {
                      await setDoc(doc(db, "users", pendingUserId), {
                        email: pendingUserEmail ?? "",
                        role: "issuer",
                        createdAt: serverTimestamp(),
                      }, { merge: true });
                      toast.success("Role saved", { id: t });
                      setRoleDialogOpen(false);
                      router.push("/");
                    } catch {
                      toast.error("Failed to save role", { id: t });
                    }
                  }}
                >
                  Bond issuer (SME)
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <p className="text-xs text-muted-foreground text-center mt-4">
            By continuing you agree to our <a href="#" className="underline underline-offset-4">Terms</a> and <a href="#" className="underline underline-offset-4">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </main>
  );
}

// Local icon wrapper to avoid extra deps for Google icon
export function SharedGoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.2-1.5 3.6-5.4 3.6-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3 14.6 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.9 0-.7-.1-1.2-.2-1.7H12z" />
    </svg>
  );
}

// minimal icon registry used above
const Icons = {
  Google: (props: React.SVGProps<SVGSVGElement>) => (
    <SharedGoogleIcon {...props} />
  ),
};


