import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Check, Heart, Phone } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

const rsvpSchema = z.object({
  parent_name: z.string().trim().min(1, "Please enter your name").max(80),
  parent_phone: z.string().trim().min(7, "Please enter a valid phone").max(30),
  child_name: z.string().trim().min(1, "Please enter your child's name").max(80),
  attending: z.enum(["yes", "no"]),
  sleepover: z.boolean(),
  sleepover_requests: z.string().max(500).optional(),
  allergies: z.string().max(300).optional(),
  message: z.string().max(500).optional(),
});

function Index() {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | "yes" | "no">(null);
  const [attending, setAttending] = useState<"yes" | "no">("yes");
  const [sleepoverOpen, setSleepoverOpen] = useState(false);
  const [sleepoverNote, setSleepoverNote] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = {
      parent_name: fd.get("parent_name") as string,
      parent_phone: fd.get("parent_phone") as string,
      child_name: fd.get("child_name") as string,
      attending,
      sleepover: sleepoverOpen,
      sleepover_requests: sleepoverNote.trim() || undefined,
      allergies: (fd.get("allergies") as string) || undefined,
      message: (fd.get("message") as string) || undefined,
    };
    const parsed = rsvpSchema.safeParse(raw);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const payload = {
      parent_name: parsed.data.parent_name,
      parent_phone: parsed.data.parent_phone,
      child_name: parsed.data.child_name,
      attending: parsed.data.attending === "yes",
      sleepover: parsed.data.sleepover,
      sleepover_requests: parsed.data.sleepover_requests ?? null,
      allergies: parsed.data.allergies ?? null,
      message: parsed.data.message ?? null,
    };
    const { error } = await supabase.from("rsvps").insert(payload);
    setSubmitting(false);
    if (error) {
      toast.error("Couldn't send RSVP. Please try again.");
      return;
    }
    setDone(attending);
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <Toaster position="top-center" />

      {/* HERO */}
      <section className="relative overflow-hidden pb-16 pt-8 md:pt-14">
        {/* palm tree */}
        <div className="pointer-events-none absolute -left-6 top-4 md:-left-2 md:top-8 animate-sway">
          <PalmTree />
        </div>
        {/* sun */}
        <div className="pointer-events-none absolute right-2 top-4 md:right-8 md:top-10">
          <Sun />
        </div>
        {/* floating hearts */}
        <Heart className="absolute left-1/3 top-24 h-5 w-5 animate-heart-pop text-hot-pink" style={{ color: "var(--hot-pink)", fill: "var(--hot-pink)" }} />
        <Heart className="absolute right-1/3 top-40 h-4 w-4 animate-heart-pop text-hot-pink" style={{ color: "var(--hot-pink)", fill: "var(--hot-pink)", animationDelay: "0.6s" }} />

        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <p className="font-script text-3xl md:text-4xl text-ink" style={{ color: "var(--ink)" }}>
            <SparkLeft /> You're invited to <SparkRight />
          </p>

          <h1 className="font-hero leading-none mt-2 text-[5.5rem] md:text-[9rem]" style={{ color: "var(--hot-pink)" }}>
            <span className="relative inline-block">
              <span
                aria-hidden
                className="absolute inset-0 translate-x-[3px] translate-y-[3px] blur-[1px]"
                style={{ color: "oklch(0.8 0.15 350 / 0.55)" }}
              >
                Eshaal's
              </span>
              <span className="relative">Eshaal's</span>
            </span>
          </h1>

          <div className="mt-4 inline-block brush-pink">
            <span className="font-chunk text-4xl md:text-6xl mr-2" style={{ color: "var(--purple-ink)" }}>
              12<sup className="text-xl md:text-2xl">th</sup>
            </span>
            <span className="font-chunk text-4xl md:text-6xl" style={{ color: "var(--ink)" }}>
              Birthday Party!
            </span>
          </div>

          <div className="relative mt-6 md:mt-8">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <Splash />
              <span className="font-hero text-6xl md:text-8xl" style={{ color: "var(--teal)" }}>
                Pool Party
              </span>
              <Splash reverse />
            </div>
            <div className="mt-1">
              <span className="font-script text-3xl md:text-4xl" style={{ color: "var(--ink)" }}>&amp;</span>
              <span className="ml-2 font-brush text-4xl md:text-6xl" style={{ color: "var(--orange-crush)" }}>
                Barbecue
              </span>
              <Heart className="inline-block ml-2 h-5 w-5 animate-heart-pop" style={{ color: "var(--hot-pink)", fill: "var(--hot-pink)" }} />
            </div>
          </div>
        </div>

        {/* flamingo + water */}
        <div className="pointer-events-none absolute -left-4 bottom-0 md:left-4 md:bottom-4 animate-bob">
          <Flamingo />
        </div>
        {/* bbq */}
        <div className="pointer-events-none absolute right-2 bottom-6 md:right-10 md:bottom-8">
          <BBQ />
        </div>
      </section>

      {/* DETAILS */}
      <section className="relative pb-10">
        <div className="mx-auto max-w-2xl px-6 space-y-3 font-body text-xl md:text-2xl" style={{ color: "var(--ink)" }}>
          <DetailRow color="var(--hot-pink)" icon={<CalendarIcon />} label="Date:" value="July 31st" />
          <DetailRow color="var(--teal)" icon={<ClockIcon />} label="Time:" value="4:00 p.m." />
          <DetailRow color="var(--purple-ink)" icon={<HouseIcon />} label="Place:" value="Eshaal's Home" pinkHeart />
          <div className="pl-10">
            <a
              href="https://maps.google.com/?q=4919+Yellowstone+Park+Dr+Fremont+CA+94538"
              target="_blank"
              rel="noreferrer"
              className="font-script text-2xl md:text-3xl underline decoration-wavy decoration-2 underline-offset-4 hover:opacity-80"
              style={{ color: "var(--ink)", textDecorationColor: "var(--hot-pink)" }}
            >
              4919 Yellowstone Park Dr,<br />Fremont, CA 94538
            </a>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-2xl px-6">
          <div className="brush-yellow inline-block w-full text-center">
            <p className="font-script text-2xl md:text-3xl" style={{ color: "var(--ink)" }}>
              Please RSVP to <a href="tel:2179792912" className="font-bold underline decoration-2 underline-offset-4 hover:opacity-80" style={{ color: "var(--hot-pink)" }}>217·979·2912</a>
            </p>
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-2xl px-6">
          <button
            type="button"
            onClick={() => setSleepoverOpen((o) => !o)}
            aria-expanded={sleepoverOpen}
            className="brush-lavender block w-full text-center cursor-pointer"
          >
            <p className="font-script text-2xl md:text-3xl" style={{ color: "var(--purple-ink)" }}>
              Optional Sleepover <Heart className="inline h-5 w-5" style={{ color: "var(--hot-pink)", fill: "var(--hot-pink)" }} />
            </p>
            <p className="font-script text-xl md:text-2xl" style={{ color: "var(--ink)" }}>
              for the girls who want to stay behind! <Heart className="inline h-4 w-4" style={{ color: "var(--purple-ink)", fill: "var(--purple-ink)" }} />
            </p>
            <p className="mt-1 font-body text-sm underline" style={{ color: "var(--purple-ink)" }}>
              {sleepoverOpen ? "Hide sleepover requests ▲" : "Tap to add sleepover requests ▼"}
            </p>
          </button>

          {sleepoverOpen && (
            <div className="animate-rise mt-3 rounded-2xl border-2 border-dashed p-4" style={{ borderColor: "var(--purple-ink)", backgroundColor: "oklch(0.85 0.08 290 / 0.15)" }}>
              <label className="font-script text-xl" style={{ color: "var(--purple-ink)" }}>
                Sleepover requests <span className="font-body text-xs opacity-70">(optional)</span>
              </label>
              <p className="font-body text-xs mb-2" style={{ color: "var(--muted-foreground)" }}>
                e.g. pickup time, dietary needs, medications, comfort item…
              </p>
              <textarea
                value={sleepoverNote}
                onChange={(e) => setSleepoverNote(e.target.value)}
                rows={3}
                maxLength={500}
                className="mt-1 w-full rounded-xl border-2 px-4 py-3 font-body outline-none transition focus:ring-2"
                style={{ borderColor: "var(--blush)", backgroundColor: "white", color: "var(--ink)" }}
                placeholder="Anything Eshaal's family should know?"
              />
            </div>
          )}

          <p className="mt-6 text-center font-script text-xl" style={{ color: "var(--muted-foreground)" }}>
            RSVP direct or questions for <span style={{ color: "var(--purple-ink)" }} className="font-bold">Zubair</span> at{" "}
            <a href="tel:2179792912" className="underline decoration-dotted" style={{ color: "var(--teal)" }}>217·979·2912</a>
          </p>
        </div>

        {/* decor: sunglasses + beach ball */}
        <div className="pointer-events-none absolute -left-2 bottom-0 hidden md:block animate-wiggle">
          <Sunglasses />
        </div>
        <div className="pointer-events-none absolute -right-2 bottom-0 hidden md:block animate-drift">
          <BeachBall />
        </div>
      </section>

      {/* RSVP FORM */}
      <section id="rsvp" className="relative pb-24 pt-6">
        <div className="mx-auto max-w-2xl px-4">
          <div className="mb-5 text-center">
            <span className="brush-pink font-hero text-5xl md:text-6xl" style={{ color: "var(--hot-pink)" }}>
              RSVP
            </span>
          </div>

          <div className="relative rounded-[28px] border-2 p-6 md:p-9 shadow-xl" style={{ background: "oklch(1 0 0 / 0.85)", borderColor: "var(--blush)" }}>
            {done ? (
              <div className="py-6 text-center animate-rise">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: "var(--sunny)" }}>
                  <Check className="h-8 w-8" style={{ color: "var(--ink)" }} />
                </div>
                <h3 className="font-hero text-4xl md:text-5xl" style={{ color: "var(--hot-pink)" }}>
                  {done === "yes" ? "See you at the pool!" : "Thanks for letting us know!"}
                </h3>
                <p className="mt-2 font-script text-xl" style={{ color: "var(--ink)" }}>
                  Your RSVP has been sent to Eshaal's family.
                </p>
                <button
                  onClick={() => setDone(null)}
                  className="mt-5 rounded-full px-6 py-2 font-script text-lg hover:brightness-110"
                  style={{ backgroundColor: "var(--teal)", color: "white" }}
                >
                  Submit another
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="grid gap-5">
                <div>
                  <Label>Will you be there?</Label>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <ToggleBtn active={attending === "yes"} onClick={() => setAttending("yes")} tone="pink">
                      🎉 Yes, splash in!
                    </ToggleBtn>
                    <ToggleBtn active={attending === "no"} onClick={() => setAttending("no")} tone="purple">
                      Sadly, can't make it
                    </ToggleBtn>
                  </div>
                </div>

                <Field label="Kid's name" name="child_name" placeholder="Zara" required />

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Parent's name" name="parent_name" placeholder="Your name" required />
                  <Field label="Parent's phone" name="parent_phone" type="tel" placeholder="217-555-0000" required />
                </div>

                {attending === "yes" && (
                  <>
                    <div className="rounded-2xl p-4" style={{ backgroundColor: "oklch(0.85 0.08 290 / 0.3)" }}>
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={sleepoverOpen}
                          onChange={(e) => setSleepoverOpen(e.target.checked)}
                          className="h-5 w-5"
                          style={{ accentColor: "var(--hot-pink)" }}
                        />
                        <span>
                          <span className="font-script text-2xl" style={{ color: "var(--purple-ink)" }}>
                            Staying for the sleepover! 🌙
                          </span>
                          <span className="block text-sm font-body" style={{ color: "var(--muted-foreground)" }}>
                            Bring pjs, pillow &amp; a toothbrush — add requests in the Optional Sleepover section above
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
                  <Label>Message for Eshaal <span className="font-body text-xs opacity-70">(optional)</span></Label>
                  <textarea
                    name="message"
                    rows={3}
                    maxLength={500}
                    className="mt-1 w-full rounded-xl border-2 px-4 py-3 font-body outline-none transition focus:ring-2"
                    style={{ borderColor: "var(--blush)", backgroundColor: "white", color: "var(--ink)" }}
                    placeholder="Happy birthday! 🎂"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 w-full rounded-full px-6 py-4 font-hero text-3xl transition hover:brightness-110 disabled:opacity-60"
                  style={{
                    backgroundColor: "var(--hot-pink)",
                    color: "white",
                    boxShadow: "0 12px 30px -12px oklch(0.68 0.24 0 / 0.55)",
                  }}
                >
                  {submitting ? "Sending..." : "Send RSVP"}
                </button>

                <p className="text-center font-script text-lg" style={{ color: "var(--teal)" }}>
                  or <a href="tel:2179792912" className="underline font-bold inline-flex items-center gap-1"><Phone className="h-4 w-4" /> RSVP to Zubair — 217·979·2912</a>
                </p>
              </form>
            )}
          </div>

          <p className="mt-8 text-center font-script text-2xl" style={{ color: "var(--teal)" }}>
            Can't wait to splash with you! 💦
          </p>
          <p className="mt-2 text-center font-body text-xs opacity-60">
            <Link to="/admin" className="underline">Host login</Link>
          </p>
        </div>
      </section>
    </main>
  );
}

/* -------- Small building blocks -------- */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="font-script text-xl" style={{ color: "var(--purple-ink)" }}>
      {children}
    </label>
  );
}

function Field({
  label, name, type = "text", placeholder, required,
}: { label: string; name: string; type?: string; placeholder?: string; required?: boolean }) {
  return (
    <div>
      <Label>{label}{required && " *"}</Label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        maxLength={type === "text" ? 100 : undefined}
        className="mt-1 w-full rounded-xl border-2 px-4 py-3 font-body outline-none transition focus:ring-2"
        style={{ borderColor: "var(--blush)", backgroundColor: "white", color: "var(--ink)" }}
      />
    </div>
  );
}

function ToggleBtn({
  children, active, onClick, tone,
}: { children: React.ReactNode; active: boolean; onClick: () => void; tone: "pink" | "purple" }) {
  const activeStyle: React.CSSProperties =
    tone === "pink"
      ? { backgroundColor: "var(--hot-pink)", color: "white", borderColor: "var(--hot-pink)" }
      : { backgroundColor: "var(--purple-ink)", color: "white", borderColor: "var(--purple-ink)" };
  const inactiveStyle: React.CSSProperties = { backgroundColor: "white", color: "var(--ink)", borderColor: "var(--blush)" };
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border-2 px-4 py-3 font-script text-xl transition hover:brightness-95"
      style={active ? activeStyle : inactiveStyle}
    >
      {children}
    </button>
  );
}

function DetailRow({
  icon, label, value, pinkHeart, color,
}: { icon: React.ReactNode; label: string; value: string; pinkHeart?: boolean; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span style={{ color }}>{icon}</span>
      <span className="font-script text-2xl md:text-3xl" style={{ color }}>{label}</span>
      <span className="font-script text-2xl md:text-3xl">{value}</span>
      {pinkHeart && <Heart className="h-5 w-5" style={{ color: "var(--hot-pink)", fill: "var(--hot-pink)" }} />}
    </div>
  );
}

/* -------- Decorative SVGs (watercolor-flavored) -------- */

function SparkLeft() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" className="inline -mb-1 animate-wiggle">
      <g stroke="var(--hot-pink)" strokeWidth="2.5" strokeLinecap="round">
        <line x1="4" y1="13" x2="22" y2="13" />
        <line x1="8" y1="6" x2="20" y2="10" />
        <line x1="8" y1="20" x2="20" y2="16" />
      </g>
    </svg>
  );
}
function SparkRight() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" className="inline -mb-1 animate-wiggle" style={{ animationDelay: "0.5s" }}>
      <g stroke="var(--hot-pink)" strokeWidth="2.5" strokeLinecap="round">
        <line x1="4" y1="13" x2="22" y2="13" />
        <line x1="6" y1="10" x2="18" y2="6" />
        <line x1="6" y1="16" x2="18" y2="20" />
      </g>
    </svg>
  );
}

function Splash({ reverse }: { reverse?: boolean }) {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="animate-splash" style={{ transform: reverse ? "scaleX(-1)" : undefined }}>
      <g stroke="var(--teal)" strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M6 24 L14 8" />
        <path d="M14 26 L20 12" />
        <path d="M22 26 L28 14" />
      </g>
    </svg>
  );
}

function Sun() {
  return (
    <svg width="140" height="140" viewBox="0 0 200 200" className="animate-spin-slow">
      <g>
        <circle cx="100" cy="100" r="34" fill="var(--sunny)" />
        <circle cx="100" cy="100" r="26" fill="oklch(0.95 0.15 90)" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * Math.PI * 2) / 12;
          const x1 = 100 + Math.cos(a) * 50;
          const y1 = 100 + Math.sin(a) * 50;
          const x2 = 100 + Math.cos(a) * 82;
          const y2 = 100 + Math.sin(a) * 82;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--sunny)" strokeWidth="7" strokeLinecap="round" />;
        })}
      </g>
    </svg>
  );
}

function PalmTree() {
  return (
    <svg width="150" height="220" viewBox="0 0 150 220">
      <g>
        {/* trunk */}
        <path d="M70 220 Q60 160 68 100 Q76 60 82 30" stroke="oklch(0.45 0.09 50)" strokeWidth="10" fill="none" strokeLinecap="round" />
        {/* trunk rings */}
        {[70, 100, 130, 160, 190].map((y, i) => (
          <line key={i} x1={65 + (i % 2 ? 0 : 2)} y1={y} x2={80} y2={y - 3} stroke="oklch(0.35 0.08 50)" strokeWidth="2" strokeLinecap="round" />
        ))}
        {/* fronds */}
        <g fill="oklch(0.55 0.18 145)">
          <path d="M82 30 Q40 20 10 40 Q45 30 82 40 Z" />
          <path d="M82 30 Q120 15 148 40 Q115 25 84 40 Z" />
          <path d="M82 30 Q50 -5 30 0 Q60 15 82 32 Z" />
          <path d="M82 30 Q120 -5 140 5 Q110 20 84 32 Z" />
          <path d="M82 30 Q75 -10 60 -20 Q80 5 84 30 Z" />
        </g>
        <g fill="oklch(0.45 0.16 145)">
          <path d="M82 30 Q55 40 30 65 Q65 40 84 38 Z" opacity="0.8" />
          <path d="M82 30 Q110 40 135 65 Q100 40 84 38 Z" opacity="0.8" />
        </g>
      </g>
    </svg>
  );
}

function Flamingo() {
  return (
    <svg width="150" height="150" viewBox="0 0 150 150">
      <g>
        {/* pool water splotch */}
        <ellipse cx="75" cy="120" rx="70" ry="18" fill="oklch(0.82 0.12 230 / 0.75)" />
        <path d="M15 122 Q35 116 55 122 T95 122 T135 122" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.85" />
        {/* float ring */}
        <ellipse cx="75" cy="100" rx="48" ry="20" fill="oklch(0.78 0.16 15)" />
        <ellipse cx="75" cy="100" rx="26" ry="9" fill="oklch(0.95 0.02 230)" />
        {/* flamingo neck + head */}
        <path d="M75 92 Q50 70 55 45 Q62 25 82 30" stroke="oklch(0.78 0.16 15)" strokeWidth="12" fill="none" strokeLinecap="round" />
        <circle cx="85" cy="32" r="9" fill="oklch(0.78 0.16 15)" />
        <circle cx="88" cy="30" r="1.6" fill="var(--ink)" />
        <path d="M92 34 L100 38 L92 40 Z" fill="oklch(0.3 0.05 40)" />
      </g>
    </svg>
  );
}

function BBQ() {
  return (
    <svg width="130" height="150" viewBox="0 0 130 150">
      <g>
        {/* smoke */}
        <g fill="oklch(0.7 0.02 260 / 0.6)">
          <circle cx="35" cy="30" r="6" className="animate-smoke" />
          <circle cx="55" cy="20" r="8" className="animate-smoke" style={{ animationDelay: "0.6s" }} />
          <circle cx="75" cy="35" r="6" className="animate-smoke" style={{ animationDelay: "1.2s" }} />
        </g>
        {/* grill bowl */}
        <ellipse cx="65" cy="70" rx="55" ry="14" fill="var(--ink)" />
        <path d="M10 70 Q65 110 120 70 Z" fill="var(--ink)" />
        {/* food */}
        <circle cx="45" cy="66" r="8" fill="oklch(0.45 0.12 40)" />
        <circle cx="70" cy="63" r="9" fill="oklch(0.55 0.2 30)" />
        <circle cx="90" cy="66" r="7" fill="oklch(0.7 0.16 90)" />
        {/* legs + wheels */}
        <line x1="25" y1="95" x2="15" y2="140" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
        <line x1="105" y1="95" x2="115" y2="140" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
        <circle cx="15" cy="142" r="6" fill="var(--ink)" />
        <circle cx="115" cy="142" r="6" fill="var(--ink)" />
      </g>
    </svg>
  );
}

function Sunglasses() {
  return (
    <svg width="120" height="90" viewBox="0 0 120 90">
      <g stroke="var(--ink)" strokeWidth="3" fill="oklch(0.78 0.16 15)">
        <path d="M15 50 Q10 30 30 25 L52 25 Q60 25 60 35 L60 50 Q60 65 40 65 Q15 65 15 50 Z" />
        <path d="M105 50 Q110 30 90 25 L68 25 Q60 25 60 35 L60 50 Q60 65 80 65 Q105 65 105 50 Z" />
        <path d="M60 40 Q60 30 60 35" fill="none" />
      </g>
      <path d="M28 42 Q34 32 42 42 Q34 52 28 42" fill="oklch(0.15 0.02 260)" stroke="none" />
      <path d="M78 42 Q84 32 92 42 Q84 52 78 42" fill="oklch(0.15 0.02 260)" stroke="none" />
    </svg>
  );
}

function BeachBall() {
  return (
    <svg width="100" height="100" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="42" fill="white" stroke="var(--ink)" strokeWidth="2" />
      <path d="M50 8 Q30 50 50 92" fill="oklch(0.78 0.16 15)" stroke="var(--ink)" strokeWidth="2" />
      <path d="M50 8 Q70 50 50 92" fill="oklch(0.9 0.17 95)" stroke="var(--ink)" strokeWidth="2" />
      <path d="M8 50 Q50 40 92 50" stroke="var(--ink)" strokeWidth="2" fill="oklch(0.7 0.13 200)" opacity="0.9" />
      <circle cx="50" cy="50" r="6" fill="white" stroke="var(--ink)" strokeWidth="2" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <rect x="3" y="5" width="20" height="18" rx="2" />
      <line x1="3" y1="10" x2="23" y2="10" />
      <line x1="8" y1="2" x2="8" y2="7" />
      <line x1="18" y1="2" x2="18" y2="7" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="13" cy="13" r="10" />
      <path d="M13 7 L13 13 L18 15" />
    </svg>
  );
}
function HouseIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
      <path d="M3 12 L13 3 L23 12" />
      <path d="M5 11 V22 H21 V11" />
      <path d="M11 22 V16 H15 V22" />
    </svg>
  );
}
