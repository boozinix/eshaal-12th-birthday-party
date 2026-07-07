import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { LogOut, Users, Check, X, Moon } from "lucide-react";

export const Route = createFileRoute("/admin")({
  ssr: false,
  component: Admin,
  head: () => ({
    meta: [{ title: "Host — Eshaal's Party RSVPs" }, { name: "robots", content: "noindex" }],
  }),
});

type Rsvp = {
  id: string;
  parent_name: string;
  parent_phone: string;
  child_name: string;
  attending: boolean;
  sleepover: boolean;
  sleepover_requests: string | null;
  allergies: string | null;
  message: string | null;
  created_at: string;
};

function Admin() {
  const [session, setSession] = useState<null | { userId: string; email: string | null }>(null);
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s ? { userId: s.user.id, email: s.user.email ?? null } : null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ? { userId: data.session.user.id, email: data.session.user.email ?? null } : null);
      setChecking(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setIsAdmin(false);
      setRsvps([]);
      return;
    }
    (async () => {
      // Claim admin if this is the first user
      const { data: claim } = await supabase.rpc("claim_admin_if_first");
      const admin = Boolean(claim);
      setIsAdmin(admin);
      if (admin) await loadRsvps();
    })();
  }, [session]);

  async function loadRsvps() {
    setLoading(true);
    const { data, error } = await supabase
      .from("rsvps")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error("Couldn't load RSVPs");
      return;
    }
    setRsvps((data ?? []) as Rsvp[]);
  }

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
  }

  if (checking) {
    return <FullPageMsg>Loading…</FullPageMsg>;
  }

  if (!session) {
    return <AuthCard />;
  }

  if (!isAdmin) {
    return (
      <FullPageMsg>
        <p className="font-script text-2xl mb-2" style={{ color: "var(--hot-pink)" }}>
          You're signed in as {session.email}, but not the host.
        </p>
        <p className="font-body text-sm opacity-70 mb-4">
          Only the first account to sign up here becomes the host.
        </p>
        <button
          onClick={signOut}
          className="rounded-full px-5 py-2 font-script text-lg text-white"
          style={{ backgroundColor: "var(--purple-ink)" }}
        >
          Sign out
        </button>
      </FullPageMsg>
    );
  }

  const yes = rsvps.filter((r) => r.attending);
  const no = rsvps.filter((r) => !r.attending);
  const sleepovers = yes.filter((r) => r.sleepover);

  return (
    <main className="min-h-screen">
      <Toaster position="top-center" />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-hero text-5xl md:text-6xl" style={{ color: "var(--hot-pink)" }}>
              Eshaal's RSVPs
            </h1>
            <p className="font-script text-xl" style={{ color: "var(--teal)" }}>
              Signed in as {session.email}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/"
              className="rounded-full border-2 px-4 py-2 font-script text-lg"
              style={{ borderColor: "var(--teal)", color: "var(--teal)" }}
            >
              View invite
            </Link>
            <button
              onClick={signOut}
              className="inline-flex items-center gap-1 rounded-full px-4 py-2 font-script text-lg text-white"
              style={{ backgroundColor: "var(--purple-ink)" }}
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </header>

        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total RSVPs" value={rsvps.length} color="var(--hot-pink)" icon={<Users />} />
          <StatCard label="Coming" value={yes.length} color="var(--teal)" icon={<Check />} />
          <StatCard label="Can't make it" value={no.length} color="var(--purple-ink)" icon={<X />} />
          <StatCard label="Sleepovers" value={sleepovers.length} color="var(--orange-crush)" icon={<Moon />} />
        </div>

        <section className="mb-10">
          <SectionTitle color="var(--teal)">🎉 Coming ({yes.length})</SectionTitle>
          {loading ? <p>Loading…</p> : yes.length === 0 ? <EmptyMsg>No yeses yet.</EmptyMsg> : (
            <div className="grid gap-3">
              {yes.map((r) => <RsvpCard key={r.id} rsvp={r} />)}
            </div>
          )}
        </section>

        <section>
          <SectionTitle color="var(--purple-ink)">Can't make it ({no.length})</SectionTitle>
          {no.length === 0 ? <EmptyMsg>Nobody has declined yet.</EmptyMsg> : (
            <div className="grid gap-3">
              {no.map((r) => <RsvpCard key={r.id} rsvp={r} />)}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function AuthCard() {
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/admin` },
      });
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Account created! You may need to confirm your email.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Welcome back!");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Toaster position="top-center" />
      <div className="w-full max-w-md rounded-[28px] border-2 p-8 shadow-xl" style={{ background: "oklch(1 0 0 / 0.9)", borderColor: "var(--blush)" }}>
        <h1 className="font-hero text-5xl text-center" style={{ color: "var(--hot-pink)" }}>
          Host Login
        </h1>
        <p className="mt-1 text-center font-script text-lg" style={{ color: "var(--teal)" }}>
          {mode === "signup" ? "Create your host account" : "Welcome back!"}
        </p>

        <form onSubmit={submit} className="mt-6 grid gap-4">
          <div>
            <label className="font-script text-lg" style={{ color: "var(--purple-ink)" }}>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border-2 px-4 py-3 font-body outline-none"
              style={{ borderColor: "var(--blush)", backgroundColor: "white" }}
            />
          </div>
          <div>
            <label className="font-script text-lg" style={{ color: "var(--purple-ink)" }}>Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border-2 px-4 py-3 font-body outline-none"
              style={{ borderColor: "var(--blush)", backgroundColor: "white" }}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full px-6 py-3 font-hero text-2xl text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--hot-pink)" }}
          >
            {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="mt-4 w-full text-center font-script text-lg underline"
          style={{ color: "var(--teal)" }}
        >
          {mode === "signup" ? "I already have an account" : "Create an account"}
        </button>

        <p className="mt-6 text-center font-body text-xs opacity-60">
          <Link to="/" className="underline">Back to invite</Link>
        </p>
      </div>
    </main>
  );
}

function FullPageMsg({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 text-center">
      <div>{children}</div>
    </main>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 bg-white p-4 shadow-sm" style={{ borderColor: color }}>
      <div className="flex items-center gap-2 font-script text-lg" style={{ color }}>
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span> {label}
      </div>
      <div className="font-chunk text-4xl" style={{ color }}>{value}</div>
    </div>
  );
}

function SectionTitle({ children, color }: { children: React.ReactNode; color: string }) {
  return <h2 className="mb-3 font-hero text-3xl" style={{ color }}>{children}</h2>;
}

function EmptyMsg({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border-2 border-dashed p-6 text-center font-script text-xl opacity-60" style={{ borderColor: "var(--blush)" }}>{children}</p>;
}

function RsvpCard({ rsvp }: { rsvp: Rsvp }) {
  const when = new Date(rsvp.created_at).toLocaleString();
  return (
    <div className="rounded-2xl border-2 bg-white p-4 shadow-sm" style={{ borderColor: "var(--blush)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-hero text-3xl" style={{ color: "var(--hot-pink)" }}>{rsvp.child_name}</div>
          <div className="font-body text-sm opacity-70">
            with {rsvp.parent_name} —{" "}
            <a href={`tel:${rsvp.parent_phone}`} className="underline" style={{ color: "var(--teal)" }}>{rsvp.parent_phone}</a>
          </div>
        </div>
        <div className="flex gap-2">
          {rsvp.attending ? (
            <Pill color="var(--teal)">Coming</Pill>
          ) : (
            <Pill color="var(--purple-ink)">Can't come</Pill>
          )}
          {rsvp.sleepover && <Pill color="var(--orange-crush)">Sleepover</Pill>}
        </div>
      </div>
      {(rsvp.allergies || rsvp.sleepover_requests || rsvp.message) && (
        <dl className="mt-3 grid gap-1 font-body text-sm" style={{ color: "var(--ink)" }}>
          {rsvp.allergies && <RsvpNote label="Allergies">{rsvp.allergies}</RsvpNote>}
          {rsvp.sleepover_requests && <RsvpNote label="Sleepover requests">{rsvp.sleepover_requests}</RsvpNote>}
          {rsvp.message && <RsvpNote label="Message">{rsvp.message}</RsvpNote>}
        </dl>
      )}
      <div className="mt-2 text-right font-body text-xs opacity-50">{when}</div>
    </div>
  );
}

function RsvpNote({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="font-script text-base" style={{ color: "var(--purple-ink)" }}>{label}: </span>
      {children}
    </div>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="rounded-full px-3 py-1 text-sm font-script text-white" style={{ backgroundColor: color }}>
      {children}
    </span>
  );
}
