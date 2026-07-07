import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { MapPin, Phone, Calendar, Clock, PartyPopper, Check } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

const rsvpSchema = z.object({
  parent_name: z.string().trim().min(1, "Please enter your name").max(80),
  parent_phone: z.string().trim().min(7, "Please enter a valid phone").max(30),
  child_name: z.string().trim().min(1, "Please enter your child's name").max(80),
  child_age: z.union([z.coerce.number().int().min(1).max(18), z.literal("")]).optional(),
  attending: z.enum(["yes", "no"]),
  sleepover: z.boolean(),
  allergies: z.string().max(300).optional(),
  message: z.string().max(500).optional(),
});

function Index() {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | "yes" | "no">(null);
  const [attending, setAttending] = useState<"yes" | "no">("yes");
  const [sleepover, setSleepover] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = {
      parent_name: fd.get("parent_name") as string,
      parent_phone: fd.get("parent_phone") as string,
      child_name: fd.get("child_name") as string,
      child_age: (fd.get("child_age") as string) || "",
      attending,
      sleepover,
      allergies: (fd.get("allergies") as string) || undefined,
      message: (fd.get("message") as string) || undefined,
    };
    const parsed = rsvpSchema.safeParse(raw);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const age = typeof parsed.data.child_age === "number" ? parsed.data.child_age : null;
    const { error } = await supabase.from("rsvps").insert({
      parent_name: parsed.data.parent_name,
      parent_phone: parsed.data.parent_phone,
      child_name: parsed.data.child_name,
      child_age: age,
      attending: parsed.data.attending === "yes",
      sleepover: parsed.data.sleepover,
      allergies: parsed.data.allergies ?? null,
      message: parsed.data.message ?? null,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Couldn't send RSVP. Please try again.");
      return;
    }
    setDone(attending);
  }

  return (
    <main className="min-h-screen">
      <Toaster position="top-center" />

      <section className="relative overflow-hidden pb-24 pt-10 md:pt-16" style={{ backgroundColor: "var(--cream)" }}>
        <div className="pointer-events-none absolute -right-16 -top-16 md:right-8 md:top-8">
          <Sun />
        </div>
        <div className="pointer-events-none absolute left-4 top-6 md:left-16 md:top-14 animate-float">
          <Sunglasses />
        </div>
        <div className="pointer-events-none absolute -left-4 bottom-8 md:left-10 md:bottom-16 opacity-90">
          <Lounger />
        </div>
        <div className="pointer-events-none absolute right-4 bottom-8 md:right-16 md:bottom-16">
          <BBQ />
        </div>

        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <p className="font-script text-3xl md:text-4xl -mb-2 md:-mb-4" style={{ color: "var(--coral)" }}>
            you're invited to
          </p>
          <h1 className="font-display text-6xl md:text-8xl leading-none" style={{ color: "var(--coral)" }}>
            <span className="relative inline-block">
              <span className="absolute inset-0 translate-x-1 translate-y-1" style={{ color: "var(--pool)", opacity: 0.6 }} aria-hidden>Eshaal's</span>
              <span className="relative">Eshaal's</span>
            </span>
          </h1>
          <div className="mt-3 flex items-end justify-center gap-3">
            <span className="font-display text-5xl md:text-7xl" style={{ color: "var(--sun)" }}>
              12<sup className="text-2xl md:text-3xl">th</sup>
            </span>
          </div>
          <h2 className="mt-1 font-display text-4xl md:text-6xl" style={{ color: "var(--navy)" }}>
            Birthday Party
          </h2>
          <div
            className="mt-6 inline-flex flex-wrap items-center justify-center gap-2 rounded-2xl px-6 py-3 shadow-lg rotate-[-2deg]"
            style={{ backgroundColor: "var(--coral)", color: "white", boxShadow: "0 10px 30px -10px oklch(0.68 0.20 15 / 0.5)" }}
          >
            <span className="font-display uppercase tracking-wider text-lg md:text-xl">Pool Party</span>
            <span className="font-script text-2xl md:text-3xl">&amp; barbecue</span>
          </div>
        </div>

        <svg
          className="absolute -bottom-1 left-0 right-0 w-full"
          viewBox="0 0 1440 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path fill="var(--pool)" d="M0,40 C240,90 480,0 720,40 C960,80 1200,10 1440,50 L1440,100 L0,100 Z" />
        </svg>
      </section>

      <section className="relative pb-20 pt-6" style={{ backgroundColor: "var(--pool)" }}>
        <PoolDots />

        <div className="relative mx-auto max-w-3xl space-y-4 px-4">
          <div className="grid grid-cols-1 gap-0 overflow-hidden rounded-2xl bg-white shadow-xl md:grid-cols-3">
            <InfoCell icon={<Calendar className="h-4 w-4" />} label="Date" value="July 31st" />
            <InfoCell icon={<Clock className="h-4 w-4" />} label="Time" value="4:00 P.M." bordered />
            <InfoCell icon={<PartyPopper className="h-4 w-4" />} label="Place" value="Eshaal's Home" bordered />
          </div>

          <div className="flex items-center justify-center gap-3 rounded-2xl bg-white px-6 py-5 shadow-xl">
            <MapPin className="h-5 w-5 shrink-0" style={{ color: "var(--coral)", fill: "var(--coral)" }} />
            <a
              href="https://maps.google.com/?q=4919+Yellowstone+Park+Dr+Fremont+CA+94538"
              target="_blank"
              rel="noreferrer"
              className="font-display text-base md:text-xl hover:underline"
              style={{ color: "var(--navy)" }}
            >
              4919 Yellowstone Park Dr, Fremont, CA 94538
            </a>
          </div>

          <a
            href="tel:2179792912"
            className="flex items-center justify-center gap-3 rounded-2xl px-6 py-5 shadow-xl transition hover:brightness-105"
            style={{ backgroundColor: "var(--sun)" }}
          >
            <Phone className="h-5 w-5" style={{ color: "var(--navy)" }} />
            <span className="font-display text-base md:text-xl uppercase tracking-wide" style={{ color: "var(--navy)" }}>
              Please RSVP to&nbsp; <span className="tracking-normal">217·979·2912</span>
            </span>
          </a>

          <div className="rounded-2xl border-2 border-dashed bg-white px-6 py-5 text-center shadow-xl" style={{ borderColor: "oklch(1 0 0 / 0.7)" }}>
            <p>
              <span className="font-display uppercase tracking-wider" style={{ color: "var(--pool-deep)" }}>Optional</span>{" "}
              <span className="font-display text-2xl" style={{ color: "var(--coral)" }}>Sleepover!</span>
            </p>
            <p className="mt-1" style={{ color: "var(--navy)" }}>
              For the girls who want to stay behind —{" "}
              <span className="font-script text-2xl" style={{ color: "var(--pool-deep)" }}>pjs, pillows &amp; friends!</span>
            </p>
          </div>
        </div>
      </section>

      <section id="rsvp" className="pb-20" style={{ backgroundColor: "var(--pool)" }}>
        <div className="mx-auto max-w-2xl px-4">
          <div className="relative rounded-3xl bg-white p-6 shadow-2xl md:p-10">
            <div
              className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-full px-6 py-2 shadow-lg"
              style={{ backgroundColor: "var(--coral)", color: "white" }}
            >
              <span className="font-display uppercase tracking-widest text-sm">RSVP here</span>
            </div>

            {done ? (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: "var(--sun)" }}>
                  <Check className="h-8 w-8" style={{ color: "var(--navy)" }} />
                </div>
                <h3 className="font-display text-3xl" style={{ color: "var(--navy)" }}>
                  {done === "yes" ? "See you at the pool!" : "Thanks for letting us know 💛"}
                </h3>
                <p className="mt-2 text-muted-foreground">Your RSVP has been sent to Eshaal's family.</p>
                <button
                  onClick={() => setDone(null)}
                  className="mt-6 rounded-full px-6 py-2 font-display hover:brightness-110"
                  style={{ backgroundColor: "var(--pool)", color: "white" }}
                >
                  Submit another
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="mt-4 grid gap-4">
                <div>
                  <Label>Will you be there?</Label>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <ToggleBtn active={attending === "yes"} onClick={() => setAttending("yes")} tone="coral">
                      🎉 Yes, count us in!
                    </ToggleBtn>
                    <ToggleBtn active={attending === "no"} onClick={() => setAttending("no")} tone="navy">
                      Sadly, can't make it
                    </ToggleBtn>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Kid's name" name="child_name" placeholder="Zara" required />
                  <Field label="Age" name="child_age" type="number" min={1} max={18} placeholder="12" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Parent's name" name="parent_name" placeholder="Your name" required />
                  <Field label="Parent's phone" name="parent_phone" type="tel" placeholder="217-555-0000" required />
                </div>

                {attending === "yes" && (
                  <>
                    <div className="rounded-2xl p-4" style={{ backgroundColor: "oklch(0.86 0.16 90 / 0.3)" }}>
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={sleepover}
                          onChange={(e) => setSleepover(e.target.checked)}
                          className="h-5 w-5"
                          style={{ accentColor: "var(--coral)" }}
                        />
                        <span>
                          <span className="font-display text-lg" style={{ color: "var(--navy)" }}>
                            Staying for the sleepover! 🌙
                          </span>
                          <span className="block text-sm text-muted-foreground">
                            (Bring pjs, pillow & a toothbrush)
                          </span>
                        </span>
                      </label>
                    </div>

                    <Field
                      label="Allergies or things we should know"
                      name="allergies"
                      placeholder="e.g. peanut allergy"
                    />
                  </>
                )}

                <div>
                  <Label>Message for Eshaal (optional)</Label>
                  <textarea
                    name="message"
                    rows={3}
                    maxLength={500}
                    className="mt-1 w-full rounded-xl border px-4 py-3 outline-none transition focus:ring-2"
                    style={{ borderColor: "var(--border)", backgroundColor: "oklch(0.94 0.02 220 / 0.4)" }}
                    placeholder="Happy birthday! 🎂"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 w-full rounded-full px-6 py-4 font-display text-lg uppercase tracking-wider shadow-lg transition hover:brightness-110 disabled:opacity-60"
                  style={{ backgroundColor: "var(--coral)", color: "white", boxShadow: "0 10px 30px -10px oklch(0.68 0.20 15 / 0.5)" }}
                >
                  {submitting ? "Sending..." : "Send RSVP"}
                </button>
              </form>
            )}
          </div>

          <p className="mt-6 text-center font-script text-2xl" style={{ color: "oklch(1 0 0 / 0.95)" }}>
            Can't wait to splash with you! 💦
          </p>
        </div>
      </section>
    </main>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="font-display text-sm uppercase tracking-wider" style={{ color: "var(--pool-deep)" }}>
      {children}
    </label>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <Label>{label}{required && " *"}</Label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        min={min}
        max={max}
        maxLength={type === "text" ? 100 : undefined}
        className="mt-1 w-full rounded-xl border px-4 py-3 outline-none transition focus:ring-2"
        style={{ borderColor: "var(--border)", backgroundColor: "oklch(0.94 0.02 220 / 0.4)" }}
      />
    </div>
  );
}

function ToggleBtn({
  children,
  active,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  tone: "coral" | "navy";
}) {
  const activeStyle: React.CSSProperties =
    tone === "coral"
      ? { backgroundColor: "var(--coral)", color: "white", borderColor: "var(--coral)" }
      : { backgroundColor: "var(--navy)", color: "white", borderColor: "var(--navy)" };
  const inactiveStyle: React.CSSProperties = {
    backgroundColor: "white",
    color: "var(--navy)",
    borderColor: "var(--border)",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border-2 px-4 py-3 font-display transition hover:opacity-95"
      style={active ? activeStyle : inactiveStyle}
    >
      {children}
    </button>
  );
}

function InfoCell({
  icon,
  label,
  value,
  bordered,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bordered?: boolean;
}) {
  return (
    <div className={`px-6 py-5 text-center ${bordered ? "md:border-l md:border-dotted" : ""}`} style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center justify-center gap-1 font-display text-xs uppercase tracking-[0.2em]" style={{ color: "var(--coral)" }}>
        {icon} {label}
      </div>
      <div className="mt-1 font-display text-xl" style={{ color: "var(--navy)" }}>{value}</div>
    </div>
  );
}

function Sun() {
  return (
    <svg width="220" height="220" viewBox="0 0 200 200" className="animate-spin-slow">
      <g fill="var(--sun)">
        <circle cx="100" cy="100" r="34" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * Math.PI * 2) / 12;
          const x1 = 100 + Math.cos(a) * 50;
          const y1 = 100 + Math.sin(a) * 50;
          const x2 = 100 + Math.cos(a) * 85;
          const y2 = 100 + Math.sin(a) * 85;
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--sun)" strokeWidth="8" strokeLinecap="round" />
          );
        })}
      </g>
    </svg>
  );
}

function Sunglasses() {
  return (
    <svg width="90" height="60" viewBox="0 0 90 60">
      <g stroke="var(--navy)" strokeWidth="3" fill="var(--coral)">
        <circle cx="22" cy="35" r="16" />
        <circle cx="66" cy="35" r="16" />
        <path d="M38 32 Q44 24 50 32" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function Lounger() {
  return (
    <svg width="120" height="90" viewBox="0 0 120 90">
      <g>
        <rect x="10" y="35" width="90" height="16" rx="4" fill="white" stroke="var(--navy)" strokeWidth="2.5" />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={14 + i * 18} y="35" width="10" height="16" fill="var(--coral)" />
        ))}
        <line x1="18" y1="51" x2="10" y2="78" stroke="var(--navy)" strokeWidth="3" strokeLinecap="round" />
        <line x1="92" y1="51" x2="100" y2="78" stroke="var(--navy)" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function BBQ() {
  return (
    <svg width="90" height="100" viewBox="0 0 90 100">
      <g>
        <ellipse cx="45" cy="50" rx="34" ry="10" fill="var(--navy)" />
        <path d="M14 50 Q45 78 76 50 Z" fill="var(--navy)" />
        <path d="M35 32 Q38 22 34 14" stroke="var(--coral)" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M45 34 Q48 22 44 12" stroke="var(--sun)" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M55 32 Q58 22 54 14" stroke="var(--coral)" strokeWidth="4" fill="none" strokeLinecap="round" />
        <line x1="20" y1="70" x2="14" y2="92" stroke="var(--navy)" strokeWidth="3" strokeLinecap="round" />
        <line x1="70" y1="70" x2="76" y2="92" stroke="var(--navy)" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function PoolDots() {
  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-40 animate-wave"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.55) 1.5px, transparent 2px)",
        backgroundSize: "22px 22px",
      }}
      aria-hidden
    />
  );
}
