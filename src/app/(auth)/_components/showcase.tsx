"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BarChart3Icon,
  CheckIcon,
  ContactIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AUTOPLAY_MS = 7000;

type Slide = {
  title: string;
  accent: string;
  body: string;
  Visual: () => React.ReactNode;
};

// TODO: swap the module names in these previews for the real app modules.
const slides: Slide[] = [
  {
    title: "Run your business.",
    accent: "Don't let it run you.",
    body: "Your team, customers, sales and reports in one place, built for business owners.",
    Visual: WorkspacePreview,
  },
  {
    title: "Every task tracked.",
    accent: "Nothing slips through.",
    body: "Assign work, set deadlines and see what's done without chasing anyone.",
    Visual: TasksPreview,
  },
  {
    title: "Know where you stand.",
    accent: "Every single day.",
    body: "Sales, collections and team performance, updated as it happens.",
    Visual: ReportsPreview,
  },
];

export function Showcase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setTimeout(() => setIndex((i) => (i + 1) % slides.length), AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [index, paused]);

  const go = (next: number) => setIndex((next + slides.length) % slides.length);
  const slide = slides[index];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="What you can do with Automate Ideas"
      className="flex flex-1 flex-col"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        key={index}
        aria-roledescription="slide"
        aria-label={`${index + 1} of ${slides.length}`}
        className="flex flex-1 flex-col gap-10 duration-500 animate-in fade-in slide-in-from-right-4 motion-reduce:animate-none"
      >
        <div className="flex max-w-lg flex-col gap-4">
          <h2 className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance xl:text-5xl">
            {slide.title}
            <span className="block text-primary">{slide.accent}</span>
          </h2>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground">{slide.body}</p>
        </div>

        <div className="flex flex-1 items-center justify-center px-2">
          <slide.Visual />
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between border-t pt-6">
        <div className="flex items-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.title}
              type="button"
              aria-label={`Show slide ${i + 1}`}
              aria-current={i === index}
              onClick={() => go(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? "w-6 bg-primary" : "w-1.5 bg-foreground/20 hover:bg-foreground/40"
              )}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon-lg" className="rounded-full" aria-label="Previous slide" onClick={() => go(index - 1)}>
            <ArrowLeftIcon />
          </Button>
          <Button variant="outline" size="icon-lg" className="rounded-full" aria-label="Next slide" onClick={() => go(index + 1)}>
            <ArrowRightIcon />
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ---------- Preview visuals (decorative mock UI) ---------- */

function PreviewCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative w-full max-w-md rounded-2xl bg-card p-5 shadow-xl ring-1 shadow-foreground/5 ring-foreground/10",
        className
      )}
    >
      {children}
    </div>
  );
}

const modules = [
  { name: "Team", hint: "Who's doing what", Icon: UsersIcon, tone: "bg-brand-green/10 text-brand-green" },
  { name: "Customers", hint: "Every contact, one list", Icon: ContactIcon, tone: "bg-brand-amber/15 text-brand-amber" },
  { name: "Sales", hint: "Move every deal forward", Icon: TrendingUpIcon, tone: "bg-brand-red/10 text-brand-red" },
  { name: "Reports", hint: "Numbers that matter", Icon: BarChart3Icon, tone: "bg-brand-green/10 text-brand-green" },
];

function WorkspacePreview() {
  return (
    <PreviewCard className="mb-10 -rotate-2">
      <p className="text-xs text-muted-foreground">Good morning, Rahul</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">What&apos;s on today?</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {modules.map(({ name, hint, Icon, tone }) => (
          <div key={name} className="relative rounded-xl border p-3">
            <ArrowUpRightIcon className="absolute top-3 right-3 size-3.5 text-muted-foreground" />
            <span className={cn("flex size-8 items-center justify-center rounded-lg", tone)}>
              <Icon className="size-4" />
            </span>
            <p className="mt-3 text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>
      <div className="absolute -right-6 -bottom-12 flex items-center gap-3 rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-lg rotate-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary-foreground/20">
          <CheckIcon className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">One login. Your whole business.</p>
          <p className="text-xs opacity-80">Pick a module and get to work.</p>
        </div>
      </div>
    </PreviewCard>
  );
}

const tasks = [
  { title: "Send March invoices", who: "PK", due: "Today", done: true },
  { title: "Follow up with Sharma Traders", who: "AS", due: "Today", done: false },
  { title: "Update price list", who: "RV", due: "Tomorrow", done: false },
  { title: "Interview for store manager", who: "NK", due: "Fri", done: false },
];

function TasksPreview() {
  return (
    <PreviewCard className="rotate-1">
      <div className="flex items-baseline justify-between">
        <p className="text-xl font-semibold tracking-tight">Today&apos;s tasks</p>
        <p className="text-xs text-muted-foreground">1 of 4 done</p>
      </div>
      <ul className="mt-4 flex flex-col divide-y">
        {tasks.map((t) => (
          <li key={t.title} className="flex items-center gap-3 py-3">
            <span
              className={cn(
                "flex size-4.5 shrink-0 items-center justify-center rounded-full border",
                t.done && "border-primary bg-primary text-primary-foreground"
              )}
            >
              {t.done ? <CheckIcon className="size-3" /> : null}
            </span>
            <span className={cn("flex-1 truncate text-sm", t.done && "text-muted-foreground line-through")}>
              {t.title}
            </span>
            <span className="text-xs text-muted-foreground">{t.due}</span>
            <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
              {t.who}
            </span>
          </li>
        ))}
      </ul>
    </PreviewCard>
  );
}

const bars = [38, 52, 44, 61, 57, 72, 84];

function ReportsPreview() {
  return (
    <PreviewCard className="-rotate-1">
      <p className="text-xs text-muted-foreground">Sales this week</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-3xl font-semibold tracking-tight tabular-nums">1,284</p>
        <p className="text-sm font-medium text-primary">+18% vs last week</p>
      </div>
      <div className="mt-5 flex h-32 items-end gap-2">
        {bars.map((h, i) => (
          <div
            key={i}
            style={{ height: `${h}%` }}
            className={cn("flex-1 rounded-md", i === bars.length - 1 ? "bg-primary" : "bg-primary/20")}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d} className="flex-1 text-center">{d}</span>
        ))}
      </div>
    </PreviewCard>
  );
}
