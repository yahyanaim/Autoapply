"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/api/hooks/use-auth";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Separator } from "@/components/ui/separator";
import { ApplyAILogo } from "@/components/brand/ApplyAILogo";
import {
  isLandingLocale,
  LANDING_LOCALE_STORAGE_KEY,
  type LandingLocale,
  translateLanding,
} from "@/lib/landing-i18n";
import { pricingPlans } from "@/lib/pricing";

const categories = [
  "Technology",
  "Finance",
  "Design",
  "Marketing",
  "Engineering",
  "Remote",
];

const companyLogoRows = [
  [
    { name: "Theodo", logo: "/logos/partners/the-odo.png" },
    { name: "Maroc Telecom", logo: "/logos/partners/maroc-telecom.png" },
    { name: "TGCC", logo: "/logos/partners/tgcc.png" },
    { name: "CAC", logo: "/logos/partners/cac.png" },
    { name: "Bottu", logo: "/logos/partners/bottu.png" },
    { name: "JESA", logo: "/logos/partners/jesa.png" },
    { name: "Marjane", logo: "/logos/partners/marjane.png" },
    { name: "PwC", logo: "/logos/partners/pwc.png" },
  ],
  [
    { name: "DXC Technology", logo: "/logos/partners/dxc.png" },
    { name: "Artefact", logo: "/logos/partners/Artefact.png" },
    { name: "Bank of Africa", logo: "/logos/partners/BOA.png" },
    { name: "Deloitte", logo: "/logos/partners/Deloitte.png" },
    { name: "Inwi", logo: "/logos/partners/Inwi.png" },
    { name: "LNKO", logo: "/logos/partners/LNKO.png" },
    { name: "Orange", logo: "/logos/partners/Orange.png" },
  ],
];

const trustSignals = [
  {
    label: "Human-approved",
    detail: "You review every submission",
  },
  {
    label: "Truthful by design",
    detail: "Unsupported claims are rejected",
  },
  {
    label: "Encrypted storage",
    detail: "Resume data stays protected",
  },
  {
    label: "Official sources first",
    detail: "Partner APIs, not risky scraping",
  },
];

const productFeatures = [
  {
    image: "/images/applyai-application-review.jpg",
    alt: "A professional reviewing an application on her laptop",
    eyebrow: "Application workspace",
    title: "Prepare each application in one focused place",
  },
  {
    image: "/images/applyai-culture-collaboration.jpg",
    alt: "Two colleagues talking while walking through a modern office",
    eyebrow: "Browser extension",
    title: "Capture jobs and autofill with your approval",
  },
  {
    image: "/images/applyai-career-focus.jpg",
    alt: "A professional preparing notes beside a laptop",
    eyebrow: "Explainable matching",
    title: "See strengths, gaps, and missing keywords",
  },
  {
    image: "/images/applyai-resume-tablet.jpg",
    alt: "A professional reviewing a resume and job description on a tablet",
    eyebrow: "Resume optimization",
    title: "Tailor your resume without inventing experience",
  },
  {
    image: "/images/applyai-interview-notes.jpg",
    alt: "Two professionals reviewing interview notes together",
    eyebrow: "Cover letters",
    title: "Create specific drafts grounded in your resume",
  },
  {
    image: "/images/applyai-team-casablanca.jpg",
    alt: "A team collaborating around a laptop in a bright office",
    eyebrow: "Application tracker",
    title: "Keep every application and next step organized",
  },
];

const steps = [
  {
    value: "resume",
    number: "1",
    title: "Build your verified profile",
    description:
      "Upload a PDF or DOCX once. ApplyAI parses your skills, experience, education, projects, certifications, and languages into a reusable profile.",
  },
  {
    value: "analyze",
    number: "2",
    title: "Understand the opportunity",
    description:
      "Paste a job or capture it with the extension to get an explainable Application Match Score, missing keywords, and weak-section flags.",
  },
  {
    value: "tailor",
    number: "3",
    title: "Create stronger materials",
    description:
      "Optimize your resume and generate a specific cover letter. Fabrication checks flag unsupported titles, dates, skills, or experience for your review.",
  },
  {
    value: "review",
    number: "4",
    title: "Review, apply, and track",
    description:
      "Use assistive autofill on supported forms, inspect every field, submit the application yourself, and follow every status in one timeline.",
  },
];

const jobs = [
  {
    role: "Senior Product Designer",
    company: "Airbnb",
    location: "Paris · Hybrid",
    type: "Full-time",
    score: "94%",
    logo: "/logos/airbnb.svg",
    category: "Design",
  },
  {
    role: "Frontend Engineer",
    company: "Spotify",
    location: "Remote · Europe",
    type: "Full-time",
    score: "91%",
    logo: "/logos/spotify.svg",
    category: "Technology",
  },
  {
    role: "Growth Associate",
    company: "Stripe",
    location: "Dublin · Hybrid",
    type: "Full-time",
    score: "88%",
    logo: "/logos/stripe.svg",
    category: "Marketing",
  },
];

const comparisonStats = [
  {
    value: "1×",
    label: "Verified profile",
    note: "vs rebuilding every application",
  },
  {
    value: "Clear",
    label: "Explainable match",
    note: "vs guessing from a job title",
  },
  {
    value: "0",
    label: "Invented claims",
    note: "truthful materials by design",
  },
  {
    value: "You",
    label: "Choose submit",
    note: "the final action always stays yours",
  },
];

const comparisonRows = [
  {
    label: "Profile setup",
    applyAI: "Upload once and reuse a structured, verified candidate profile.",
    manual: "Re-enter the same experience and contact details on every site.",
  },
  {
    label: "Job fit",
    applyAI:
      "See a score with strengths, missing keywords, and weaker sections.",
    manual:
      "Read every description and guess whether the role is worth your time.",
  },
  {
    label: "Materials",
    applyAI:
      "Tailor your resume and cover letter using only your real experience.",
    manual:
      "Rewrite everything from scratch or accept generic, unverified output.",
  },
  {
    label: "Form filling",
    applyAI:
      "Autofill supported forms, review every field, and submit yourself.",
    manual: "Copy the same information between tabs for every application.",
  },
  {
    label: "Follow-up",
    applyAI:
      "Keep status, activity, documents, and next steps in one timeline.",
    manual:
      "Track progress across inboxes, bookmarks, notes, and spreadsheets.",
  },
];

const enterpriseFeatures = [
  "Team and organization accounts with seat management",
  "Career-services and university analytics",
  "SAML SSO and advanced audit logging",
  "Volume pricing and a SOC 2 Type II readiness path",
];

const defaultHeroHeadline = "A Smarter Way To Make Every Application Stronger.";
const defaultHeroHighlight = "Smarter Way";

export default function HomePage() {
  const router = useRouter();
  const { user, isInitialized } = useAuth();
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeStep, setActiveStep] = useState("resume");
  const [typedHeadlineLength, setTypedHeadlineLength] = useState(0);
  const [locale, setLocale] = useState<LandingLocale>("en");

  const t = (text: string) => translateLanding(locale, text);
  const heroHeadline = t(defaultHeroHeadline);
  const heroHighlight = t(defaultHeroHighlight);
  const heroHighlightStart = heroHeadline.indexOf(heroHighlight);
  const heroHighlightEnd = heroHighlightStart + heroHighlight.length;

  const localizedCategories = categories.map((category) => ({
    label: t(category),
    query: category,
  }));
  const localizedTrustSignals = trustSignals.map((signal) => ({
    label: t(signal.label),
    detail: t(signal.detail),
  }));
  const localizedProductFeatures = productFeatures.map((feature) => ({
    ...feature,
    alt: t(feature.alt),
    eyebrow: t(feature.eyebrow),
    title: t(feature.title),
  }));
  const localizedSteps = steps.map((step) => ({
    ...step,
    title: t(step.title),
    description: t(step.description),
  }));
  const localizedJobs = jobs.map((job) => ({
    ...job,
    roleLabel: t(job.role),
    locationLabel: t(job.location),
    typeLabel: t(job.type),
    categoryLabel: t(job.category),
  }));
  const localizedComparisonStats = comparisonStats.map((stat) => ({
    value: t(stat.value),
    label: t(stat.label),
    note: t(stat.note),
  }));
  const localizedComparisonRows = comparisonRows.map((row) => ({
    label: t(row.label),
    applyAI: t(row.applyAI),
    manual: t(row.manual),
  }));

  useEffect(() => {
    if (isInitialized && user) router.replace("/dashboard");
  }, [isInitialized, router, user]);

  useEffect(() => {
    const storedLocale = window.localStorage.getItem(
      LANDING_LOCALE_STORAGE_KEY,
    );
    if (isLandingLocale(storedLocale)) {
      setLocale(storedLocale);
      return;
    }

    if (window.navigator.language.toLowerCase().startsWith("ar")) {
      setLocale("ar");
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const previousLanguage = root.lang;
    const previousDirection = root.dir;

    root.lang = locale;
    root.dir = locale === "ar" ? "rtl" : "ltr";

    return () => {
      root.lang = previousLanguage;
      root.dir = previousDirection;
    };
  }, [locale]);

  useEffect(() => {
    if (!isInitialized || user) return;

    setTypedHeadlineLength(0);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTypedHeadlineLength(heroHeadline.length);
      return;
    }

    let characterIndex = 0;
    let typingTimer: ReturnType<typeof setInterval> | undefined;
    const startTimer = window.setTimeout(() => {
      typingTimer = setInterval(() => {
        characterIndex += 1;
        setTypedHeadlineLength(characterIndex);

        if (characterIndex >= heroHeadline.length && typingTimer) {
          clearInterval(typingTimer);
        }
      }, 42);
    }, 320);

    return () => {
      window.clearTimeout(startTimer);
      if (typingTimer) clearInterval(typingTimer);
    };
  }, [heroHeadline, isInitialized, user]);

  if (!isInitialized || user) return null;

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    router.push(`/register?intent=search&query=${encodeURIComponent(value)}`);
  };

  const changeLocale = (nextLocale: LandingLocale) => {
    setLocale(nextLocale);
    window.localStorage.setItem(LANDING_LOCALE_STORAGE_KEY, nextLocale);
    setMobileOpen(false);
  };

  const selectedStep =
    localizedSteps.find((step) => step.value === activeStep) ??
    localizedSteps[0]!;
  const activeStepIndex = localizedSteps.findIndex(
    (step) => step.value === selectedStep.value,
  );
  const stepGridColumns =
    [
      "lg:grid-cols-[2.25fr_1fr_1fr_1fr]",
      "lg:grid-cols-[1fr_2.25fr_1fr_1fr]",
      "lg:grid-cols-[1fr_1fr_2.25fr_1fr]",
      "lg:grid-cols-[1fr_1fr_1fr_2.25fr]",
    ][activeStepIndex] ?? "lg:grid-cols-[2.25fr_1fr_1fr_1fr]";

  return (
    <div
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="min-h-screen overflow-hidden bg-[#f7f7f5] text-[#171714]"
    >
      <header className="relative z-50 px-4 pt-4 sm:px-6 sm:pt-6">
        <nav
          aria-label={t("Main navigation")}
          className="mx-auto flex min-h-[58px] max-w-[1112px] items-center justify-between rounded-xl border border-black/[0.06] bg-white/95 px-4 shadow-[0_10px_32px_rgba(23,23,20,0.06)] backdrop-blur-xl sm:px-5"
        >
          <Link href="/" aria-label={t("ApplyAI home")} className="shrink-0">
            <ApplyAILogo className="h-8 w-auto sm:h-9" priority />
          </Link>

          <div className="hidden items-center gap-8 lg:flex">
            <Link
              href="#features"
              className="text-sm font-medium text-gray-700 transition hover:text-black"
            >
              {t("Features")}
            </Link>
            <Link
              href="#how-it-works"
              className="text-sm font-medium text-gray-700 transition hover:text-black"
            >
              {t("How it works")}
            </Link>
            <Link
              href="#jobs"
              className="text-sm font-medium text-gray-700 transition hover:text-black"
            >
              {t("Job matches")}
            </Link>
            <Link
              href="#pricing"
              className="text-sm font-medium text-gray-700 transition hover:text-black"
            >
              {t("Pricing")}
            </Link>
            <Link
              href="/extension/connect"
              className="text-sm font-medium text-gray-700 transition hover:text-black"
            >
              {t("Extension")}
            </Link>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <div
              className="flex rounded-lg border border-black/[0.08] bg-[#f7f7f5] p-0.5"
              aria-label={locale === "ar" ? "اختيار اللغة" : "Choose language"}
            >
              <button
                type="button"
                onClick={() => changeLocale("en")}
                aria-pressed={locale === "en"}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                  locale === "en"
                    ? "bg-white text-black shadow-sm"
                    : "text-gray-500 hover:text-black"
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => changeLocale("ar")}
                aria-pressed={locale === "ar"}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                  locale === "ar"
                    ? "bg-white text-black shadow-sm"
                    : "text-gray-500 hover:text-black"
                }`}
              >
                العربية
              </button>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">{t("Sign in")}</Link>
            </Button>
            <Button asChild size="sm" className="rounded-xl px-4">
              <Link href="/register">
                {t("Get started")}
                <span aria-hidden="true">{locale === "ar" ? "←" : "→"}</span>
              </Link>
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            onClick={() => setMobileOpen((current) => !current)}
            aria-label={t(mobileOpen ? "Close navigation" : "Open navigation")}
            aria-expanded={mobileOpen}
          >
            <span className="text-xs font-semibold">
              {t(mobileOpen ? "Close" : "Menu")}
            </span>
          </Button>
        </nav>

        {mobileOpen && (
          <div className="mx-auto mt-2 max-w-[1112px] rounded-xl border border-black/[0.06] bg-white p-3 shadow-xl sm:hidden">
            {[
              ["Features", "#features"],
              ["How it works", "#how-it-works"],
              ["Job matches", "#jobs"],
              ["Pricing", "#pricing"],
              ["Extension", "/extension/connect"],
            ].map(([label, href]) => (
              <Link
                key={label}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t(label)}
              </Link>
            ))}
            <div className="my-2 flex rounded-lg border border-black/[0.08] bg-[#f7f7f5] p-1">
              <button
                type="button"
                onClick={() => changeLocale("en")}
                aria-pressed={locale === "en"}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold ${
                  locale === "en"
                    ? "bg-white text-black shadow-sm"
                    : "text-gray-500"
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => changeLocale("ar")}
                aria-pressed={locale === "ar"}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold ${
                  locale === "ar"
                    ? "bg-white text-black shadow-sm"
                    : "text-gray-500"
                }`}
              >
                العربية
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-3">
              <Button asChild variant="outline">
                <Link href="/login">{t("Sign in")}</Link>
              </Button>
              <Button asChild>
                <Link href="/register">{t("Get started")}</Link>
              </Button>
            </div>
          </div>
        )}
      </header>

      <main>
        <section className="relative -mt-[82px] overflow-hidden pb-20 pt-36 sm:pb-28 sm:pt-48">
          <div className="product-grid absolute inset-0" />
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#f7f7f5] to-transparent" />

          <div className="section-shell relative text-center">
            <Badge
              variant="outline"
              className="mb-7 border-primary-200 bg-white/80 px-3 py-1.5 text-primary-700 shadow-sm"
            >
              {t("AI-powered applications. Human-approved decisions.")}
            </Badge>

            <h1
              aria-label={heroHeadline}
              className="relative mx-auto max-w-[1040px] text-[2.75rem] font-bold leading-[1.01] tracking-[-0.05em] sm:text-[4.6rem] lg:text-[5.55rem]"
            >
              <span aria-hidden="true" className="invisible">
                {heroHeadline.slice(0, heroHighlightStart)}
                <span className="orange-word">{heroHighlight}</span>
                {heroHeadline.slice(heroHighlightEnd)}
              </span>
              <span aria-hidden="true" className="absolute inset-0">
                {heroHeadline.slice(
                  0,
                  Math.min(typedHeadlineLength, heroHighlightStart),
                )}
                <span className="orange-word">
                  {heroHeadline.slice(
                    heroHighlightStart,
                    Math.min(typedHeadlineLength, heroHighlightEnd),
                  )}
                </span>
                {typedHeadlineLength > heroHighlightEnd
                  ? heroHeadline.slice(heroHighlightEnd, typedHeadlineLength)
                  : ""}
                {typedHeadlineLength < heroHeadline.length && (
                  <span className="typewriter-cursor" />
                )}
              </span>
            </h1>
            <p className="mx-auto mt-7 max-w-[720px] text-base leading-7 text-gray-600 sm:mt-8 sm:text-xl sm:leading-8">
              {t(
                "ApplyAI understands your experience, explains job fit, creates truthful tailored materials, and keeps your entire application pipeline moving.",
              )}
            </p>

            <form
              onSubmit={submitSearch}
              role="search"
              aria-label={t("Search for jobs")}
              className="glass-panel mx-auto mt-9 max-w-[700px] rounded-2xl border border-primary-200/80 p-3 text-start sm:mt-11 sm:p-4"
            >
              <div className="flex items-center gap-3">
                <span
                  className="ml-1 h-8 w-1 shrink-0 rounded-full bg-primary-500"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t(
                      "Describe your ideal role, skill, company, or location",
                    )}
                    aria-label={t(
                      "Describe your ideal role, skill, company, or location",
                    )}
                    className="h-11 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 sm:text-base"
                  />
                </div>
                <Button
                  type="submit"
                  size="icon"
                  className="h-11 w-11 shrink-0 rounded-xl"
                  aria-label={t("Search opportunities")}
                >
                  <span aria-hidden="true">{locale === "ar" ? "←" : "→"}</span>
                </Button>
              </div>
              <Separator className="my-3 bg-black/[0.06]" />
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1 text-xs font-semibold">
                <span className="border-b border-primary-500 pb-1 text-primary-600">
                  {t("Search opportunities")}
                </span>
                <Link
                  href="/register?intent=resume-match"
                  className="border-b border-transparent pb-1 text-gray-500 transition hover:border-gray-300 hover:text-black"
                >
                  {t("Search from your resume")}
                </Link>
              </div>
            </form>

            <div className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-2">
              {localizedCategories.map(({ label, query: category }) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setQuery(category)}
                  className="rounded-lg border border-black/[0.08] bg-white/85 px-3.5 py-2 text-xs font-semibold text-gray-600 shadow-sm transition hover:border-primary-200 hover:text-primary-700"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-20 sm:mt-28">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
                {t("Built for responsible, secure applications")}
              </p>
              <div className="mt-7 grid border-y border-black/[0.07] sm:grid-cols-2 lg:grid-cols-4">
                {localizedTrustSignals.map(({ label, detail }, index) => (
                  <div
                    key={label}
                    className={`flex items-center gap-3 border-b border-black/[0.07] px-5 py-5 text-left sm:border-r ${
                      index >= 2 ? "sm:border-b-0" : ""
                    } ${index % 2 === 1 ? "sm:border-r-0" : ""} ${
                      index === localizedTrustSignals.length - 1
                        ? "lg:border-r-0"
                        : ""
                    } lg:border-b-0 lg:border-r`}
                  >
                    <TrustIllustration variant={index} />
                    <div>
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="mt-0.5 text-xs leading-5 text-gray-500">
                        {detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          id="features"
          className="overflow-hidden bg-white py-20 sm:py-28"
        >
          <div className="section-shell text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary-600">
              {t("One workspace, the complete application")}
            </p>
            <h2 className="mx-auto mt-4 max-w-4xl text-4xl font-medium leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-[4.25rem]">
              {t("See the whole opportunity. Build your strongest case.")}
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-gray-600 sm:text-lg">
              {t(
                "Bring search, fit analysis, truthful tailoring, browser assistance, and application tracking into one calm, focused workflow.",
              )}
            </p>
          </div>

          <div className="feature-marquee mt-14 h-[460px] sm:mt-16 sm:h-[550px]">
            <div className="feature-marquee-track">
              {[...localizedProductFeatures, ...localizedProductFeatures].map(
                (feature, index) => {
                  const cardStyles = [
                    "mt-16 h-[330px] w-[210px] sm:h-[405px] sm:w-[255px]",
                    "mt-0 h-[390px] w-[225px] sm:h-[490px] sm:w-[290px]",
                    "mt-12 h-[350px] w-[215px] sm:h-[430px] sm:w-[265px]",
                    "mt-0 h-[405px] w-[230px] sm:h-[500px] sm:w-[295px]",
                    "mt-20 h-[320px] w-[205px] sm:h-[395px] sm:w-[245px]",
                    "mt-7 h-[370px] w-[220px] sm:h-[460px] sm:w-[275px]",
                  ];

                  return (
                    <article
                      key={`${feature.title}-${index}`}
                      aria-hidden={index >= localizedProductFeatures.length}
                      className={`group relative flex-none overflow-hidden rounded-xl bg-gray-200 shadow-[0_18px_50px_rgba(20,20,18,0.11)] ${
                        cardStyles[index % localizedProductFeatures.length]
                      }`}
                    >
                      <Image
                        src={feature.image}
                        alt={
                          index < localizedProductFeatures.length
                            ? feature.alt
                            : ""
                        }
                        fill
                        sizes="(max-width: 640px) 230px, 295px"
                        className="object-cover transition duration-700 ease-out group-hover:scale-[1.035]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-5 text-start text-white sm:p-6">
                        <span className="inline-flex rounded-lg bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary-600 shadow-sm">
                          {feature.eyebrow}
                        </span>
                        <h3 className="mt-3 text-lg font-semibold leading-tight tracking-[-0.025em] sm:text-xl">
                          {feature.title}
                        </h3>
                      </div>
                    </article>
                  );
                },
              )}
            </div>
          </div>

          <div className="section-shell mt-4 flex justify-center">
            <Button asChild size="lg" className="rounded-xl px-7">
              <Link href="#how-it-works">
                {t("Explore the ApplyAI workflow")}
                <span aria-hidden="true">{locale === "ar" ? "←" : "→"}</span>
              </Link>
            </Button>
          </div>
        </section>

        <section id="how-it-works" className="bg-white py-20 sm:py-32">
          <div className="section-shell">
            <div className="mx-auto max-w-4xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary-600">
                {t("From resume to a reviewed submission")}
              </p>
              <h2 className="mt-4 text-4xl font-medium leading-[1.02] tracking-[-0.045em] sm:text-6xl">
                {t("From your resume to a stronger application.")}
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-gray-600 sm:text-lg">
                {t(
                  "Four connected steps bring your verified experience, job analysis, tailored materials, and final review into one clear flow.",
                )}
              </p>
            </div>

            <div className="mt-14 overflow-hidden rounded-[28px] border border-black/[0.06] bg-[#ece7df] p-3 shadow-[0_22px_70px_rgba(35,28,21,0.1)] sm:p-5">
              <WorkflowDashboard activeStep={selectedStep} locale={locale} />
            </div>

            <div
              className={`mt-4 grid gap-3 transition-[grid-template-columns] duration-500 ease-out sm:grid-cols-2 ${stepGridColumns}`}
            >
              {localizedSteps.map((step) => {
                const isActive = step.value === activeStep;

                return (
                  <button
                    key={step.value}
                    type="button"
                    onClick={() => setActiveStep(step.value)}
                    onMouseEnter={() => setActiveStep(step.value)}
                    onFocus={() => setActiveStep(step.value)}
                    aria-pressed={isActive}
                    className={`group relative min-h-[170px] overflow-hidden rounded-2xl border p-6 text-start transition-all duration-500 ease-out ${
                      isActive
                        ? "border-primary-400 bg-white shadow-[inset_0_-3px_0_#f47b2a]"
                        : "border-black/[0.07] bg-[#faf9f7] hover:border-primary-200"
                    }`}
                    style={{
                      backgroundImage:
                        "linear-gradient(rgba(29, 25, 21, 0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 25, 21, 0.035) 1px, transparent 1px)",
                      backgroundSize: "28px 28px",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute -bottom-9 right-3 text-[9.5rem] font-semibold leading-none tracking-[-0.08em] transition-colors duration-500 ${
                        isActive ? "text-orange-100" : "text-[#f2dfcd]"
                      }`}
                    >
                      {step.number}
                    </span>
                    <span className="relative block max-w-[280px] text-xl font-semibold leading-[1.08] tracking-[-0.025em]">
                      {step.title}
                    </span>
                    {isActive && (
                      <span className="relative mt-3 block max-w-lg text-sm leading-6 text-gray-600">
                        {step.description}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section id="jobs" className="bg-[#f1f1ed] py-20 sm:py-28">
          <div className="section-shell">
            <div className="mx-auto max-w-4xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary-600">
                {t("Opportunities worth your attention")}
              </p>
              <h2 className="mt-4 text-4xl font-medium leading-[1.02] tracking-[-0.045em] sm:text-6xl">
                {t("Start with a better match.")}
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-gray-600 sm:text-lg">
                {t(
                  "Compare roles against your selected resume before investing time in tailoring and forms.",
                )}
              </p>
            </div>

            <div className="mt-9 flex flex-wrap justify-center gap-2">
              {[
                "Technology",
                "Design",
                "Marketing",
                "Finance",
                "Operations",
              ].map((category) => (
                <Link
                  key={category}
                  href={`/register?intent=search&query=${encodeURIComponent(category)}`}
                  className="rounded-lg border border-black/[0.08] bg-white px-4 py-2 text-xs font-semibold text-gray-600 transition hover:border-primary-200 hover:text-primary-700"
                >
                  {t(category)}
                </Link>
              ))}
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {localizedJobs.map((job) => (
                <Card
                  key={job.role}
                  className="group flex min-h-[300px] flex-col rounded-2xl border-black/[0.07] bg-white p-5 text-black shadow-none transition duration-300 hover:-translate-y-1 hover:shadow-xl sm:p-6"
                >
                  <div className="flex items-start justify-between gap-5">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-black/[0.06] bg-white">
                      <Image
                        src={job.logo}
                        alt={`${job.company} ${locale === "ar" ? "شعار" : "logo"}`}
                        width={26}
                        height={26}
                        className="h-6 w-6 object-contain"
                      />
                    </span>
                    <Badge
                      variant="secondary"
                      className="border-0 bg-[#eef5ea] px-3 py-1 text-[#436039]"
                    >
                      {job.score} {t("match")}
                    </Badge>
                  </div>
                  <div className="mt-7">
                    <p className="text-sm font-medium text-gray-500">
                      {job.company}
                    </p>
                    <h3 className="mt-1.5 text-xl font-semibold tracking-[-0.03em]">
                      {job.roleLabel}
                    </h3>
                    <Badge
                      variant="outline"
                      className="mt-3 border-black/10 text-gray-500"
                    >
                      {job.categoryLabel}
                    </Badge>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                    <p>{job.locationLabel}</p>
                    <span className="text-gray-300" aria-hidden="true">
                      ·
                    </span>
                    <p>{job.typeLabel}</p>
                  </div>
                  <Button
                    asChild
                    variant="ghost"
                    className="mt-auto w-full justify-between rounded-none border-t border-black/[0.07] px-0 pt-5 hover:bg-transparent hover:text-primary-600"
                  >
                    <Link
                      href={`/register?role=${encodeURIComponent(job.role)}`}
                    >
                      {t("Analyze this opportunity")}
                      <span
                        className="transition group-hover:translate-x-1"
                        aria-hidden="true"
                      >
                        {locale === "ar" ? "←" : "→"}
                      </span>
                    </Link>
                  </Button>
                </Card>
              ))}
            </div>

            <div className="mt-9 flex justify-center">
              <Button
                asChild
                variant="outline"
                size="lg"
                className="rounded-xl bg-white"
              >
                <Link href="/register?intent=search">
                  {t("Explore more opportunities")}
                  <span aria-hidden="true">{locale === "ar" ? "←" : "→"}</span>
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-white py-20 sm:py-28">
          <div className="section-shell">
            <div className="relative mx-auto max-w-4xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary-600">
                {t("Wall of confidence")}
              </p>
              <h2 className="mt-4 text-4xl font-medium leading-[1.02] tracking-[-0.045em] sm:text-6xl">
                {t("Clarity at every part of the application.")}
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-gray-600 sm:text-lg">
                {t(
                  "See the next step, understand the reason behind it, and keep the final decision in your hands.",
                )}
              </p>
            </div>

            <div className="mt-14 grid gap-4 lg:grid-cols-12 lg:items-stretch">
              <article className="group relative min-h-[540px] overflow-hidden rounded-[30px] bg-[#262621] lg:col-span-4 lg:min-h-[608px]">
                <Image
                  src="/images/applyai-application-review.jpg"
                  alt={t("A professional reviewing an application on a laptop")}
                  fill
                  sizes="(max-width: 1024px) 100vw, 34vw"
                  className="object-cover transition duration-700 group-hover:scale-[1.03]"
                />
                <div
                  className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent"
                  aria-hidden="true"
                />
                <span className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#262621] shadow-sm">
                  <span
                    className="text-base leading-none text-primary-500"
                    aria-hidden="true"
                  >
                    ✦
                  </span>
                  {t("Candidate view")}
                </span>
                <div className="absolute inset-x-5 bottom-5 rounded-2xl bg-[#191916]/88 p-5 text-white backdrop-blur-md">
                  <p className="text-xs font-medium uppercase tracking-[0.13em] text-primary-300">
                    {t("Clear before you commit")}
                  </p>
                  <p className="mt-2 text-xl font-medium leading-tight tracking-[-0.028em]">
                    {t(
                      "“I can see what is worth my time before I start rewriting.”",
                    )}
                  </p>
                  <p className="mt-4 text-sm text-white/65">
                    {t("A calmer, more intentional search.")}
                  </p>
                </div>
              </article>

              <div className="flex flex-col gap-4 lg:col-span-4">
                <article className="relative min-h-[356px] overflow-hidden rounded-[30px] border border-black/[0.07] bg-[#f4eee7] p-6 sm:p-7">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-500 text-base font-bold text-white">
                        A
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[#262621]">
                          {t("ApplyAI guidance")}
                        </p>
                        <p className="text-xs text-gray-500">{t("Just now")}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-primary-600 shadow-sm">
                      ✦ {t("Clear next step")}
                    </span>
                  </div>

                  <div className="mt-7 space-y-3 text-sm leading-6">
                    <div className="max-w-[88%] rounded-2xl rounded-tl-md bg-white p-4 text-gray-700 shadow-sm">
                      {t(
                        "I found a role I like. What should I focus on first?",
                      )}
                    </div>
                    <div className="ms-auto max-w-[90%] rounded-2xl rounded-tr-md bg-primary-500 p-4 text-white shadow-sm">
                      {t(
                        "Your experience is a strong match. Review these three keywords, then tailor the summary using only your verified history.",
                      )}
                    </div>
                  </div>

                  <div className="mt-5 flex items-center gap-2 text-sm font-medium text-gray-600">
                    <span aria-hidden="true">😊</span>
                    {t("Understand the why, then choose the action.")}
                  </div>
                </article>

                <article className="relative flex min-h-[236px] flex-1 flex-col justify-between overflow-hidden rounded-[30px] bg-[#20201d] p-6 text-white sm:p-7">
                  <span
                    className="absolute -right-1 top-2 text-7xl text-primary-500/90"
                    aria-hidden="true"
                  >
                    ✳
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.13em] text-primary-300">
                      {t("Your application, your call")}
                    </p>
                    <p className="mt-4 max-w-sm text-2xl font-medium leading-[1.08] tracking-[-0.035em]">
                      {t("Helpful direction, without taking over your story.")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-white/68">
                    <span>
                      <span className="me-1 text-primary-400">✦</span>{" "}
                      {t("Explain the match")}
                    </span>
                    <span>
                      <span className="me-1 text-primary-400">↗</span>{" "}
                      {t("Review before submitting")}
                    </span>
                  </div>
                </article>
              </div>

              <article className="group relative min-h-[540px] overflow-hidden rounded-[30px] bg-[#262621] lg:col-span-4 lg:min-h-[608px]">
                <Image
                  src="/images/applyai-interview-notes.jpg"
                  alt={t("Two professionals reviewing notes together")}
                  fill
                  sizes="(max-width: 1024px) 100vw, 34vw"
                  className="object-cover transition duration-700 group-hover:scale-[1.03]"
                />
                <div
                  className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent"
                  aria-hidden="true"
                />
                <span className="absolute right-5 top-5 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#262621] shadow-sm">
                  <span
                    className="text-base leading-none text-primary-500"
                    aria-hidden="true"
                  >
                    ↗
                  </span>
                  {t("Review first")}
                </span>
                <div className="absolute inset-x-5 bottom-5 rounded-2xl bg-[#191916]/88 p-5 text-white backdrop-blur-md">
                  <p className="text-xs font-medium uppercase tracking-[0.13em] text-white">
                    {t("Truthful tailoring")}
                  </p>
                  <p className="mt-2 text-xl font-medium leading-tight tracking-[-0.028em] text-white">
                    {t(
                      "“Every suggested change stays connected to my real experience.”",
                    )}
                  </p>
                  <p className="mt-4 text-sm text-white">
                    {t("Keep your voice. Strengthen the evidence.")}
                  </p>
                </div>
              </article>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <article className="rounded-2xl border border-black/[0.07] bg-[#f7f4ef] p-5">
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm text-primary-600"
                  aria-hidden="true"
                >
                  ✦
                </span>
                <p className="mt-4 text-sm font-semibold text-[#262621]">
                  {t("Why this role fits")}
                </p>
                <p className="mt-1 text-sm leading-6 text-gray-600">
                  {t(
                    "See strengths, gaps, and application signals before writing a single line.",
                  )}
                </p>
                <p className="mt-3 text-xs leading-5 text-gray-500">
                  {t(
                    "Guidance only—employer screening systems and decisions vary.",
                  )}
                </p>
              </article>
              <article className="rounded-2xl border border-black/[0.07] bg-white p-5">
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm text-primary-600"
                  aria-hidden="true"
                >
                  ☻
                </span>
                <p className="mt-4 text-sm font-semibold text-[#262621]">
                  {t("Your words stay yours")}
                </p>
                <p className="mt-1 text-sm leading-6 text-gray-600">
                  {t(
                    "Improve clarity without adding experience you have not verified.",
                  )}
                </p>
              </article>
              <article className="relative overflow-hidden rounded-2xl bg-primary-500 p-5 text-white">
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/18 text-sm"
                  aria-hidden="true"
                >
                  ↗
                </span>
                <p className="mt-4 text-sm font-semibold">
                  {t("You choose submit")}
                </p>
                <p className="mt-1 max-w-xs text-sm leading-6 text-white/78">
                  {t(
                    "Assistive autofill waits for your final review on every application.",
                  )}
                </p>
              </article>
            </div>
          </div>
        </section>

        <section
          id="comparison"
          className="bg-[#100a06] py-20 text-white sm:py-28"
        >
          <div className="section-shell">
            <div className="mx-auto max-w-5xl text-center">
              <h2 className="text-4xl font-normal leading-[1.06] tracking-[-0.045em] sm:text-5xl lg:text-[3.35rem]">
                {t("Stop repeating the same")}{" "}
                <span className="text-primary-500">
                  {t("application work.")}
                </span>
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-white/55 sm:text-base">
                {t(
                  "Compare ApplyAI with the fragmented, repetitive way of applying manually.",
                )}
              </p>
            </div>

            <div className="mx-auto mt-10 flex w-fit items-center rounded-xl border border-white/10 bg-white/[0.035] p-1 text-sm font-semibold">
              <span className="rounded-lg bg-primary-500 px-5 py-3 text-white">
                {t("Application workflow")}
              </span>
              <span className="px-5 py-3 text-white/45">
                {t("Career intelligence")}
              </span>
            </div>

            <div className="mx-auto mt-12 grid max-w-6xl gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {localizedComparisonStats.map((stat, index) => (
                <div
                  key={stat.value}
                  className={`px-5 text-center ${
                    index % 2 === 0 ? "sm:border-r sm:border-white/10" : ""
                  } ${index < localizedComparisonStats.length - 1 ? "lg:border-r lg:border-white/10" : ""}`}
                >
                  <p className="text-5xl font-semibold tracking-[-0.055em] text-primary-500 sm:text-6xl">
                    {stat.value}
                  </p>
                  <p className="mt-3 text-sm font-semibold text-white/85">
                    {stat.label}
                  </p>
                  <p className="mx-auto mt-1 max-w-[220px] text-xs italic leading-5 text-white/35">
                    {stat.note}
                  </p>
                </div>
              ))}
            </div>

            <div className="mx-auto mt-14 max-w-5xl">
              <div className="hidden grid-cols-[185px_1fr_1fr] md:grid">
                <div />
                <div className="rounded-t-xl bg-primary-500 px-6 py-5 text-center text-sm font-semibold text-white">
                  {t("Apply with ApplyAI")}
                </div>
                <div className="flex items-center justify-center gap-2 px-6 py-5 text-sm font-semibold text-white/38">
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-white/20 text-xs"
                    aria-hidden="true"
                  >
                    ×
                  </span>
                  {t("Manual workflow")}
                </div>
              </div>

              {localizedComparisonRows.map((row) => (
                <div
                  key={row.label}
                  className="grid gap-3 border-b border-white/10 py-5 md:grid-cols-[185px_1fr_1fr] md:gap-0 md:py-0"
                >
                  <h3 className="self-center text-sm font-semibold text-white/55 md:px-3 md:py-6">
                    {row.label}
                  </h3>
                  <div className="rounded-xl bg-[#1b100a] p-4 md:rounded-none md:px-6 md:py-6">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-400 md:hidden">
                      ApplyAI
                    </p>
                    <p className="flex gap-3 text-sm font-semibold leading-6 text-white/82">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-500/20 text-xs text-primary-400"
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                      {row.applyAI}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/[0.025] p-4 md:rounded-none md:px-7 md:py-6">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35 md:hidden">
                      {t("Manual workflow")}
                    </p>
                    <p className="text-sm italic leading-6 text-white/38">
                      {row.manual}
                    </p>
                  </div>
                </div>
              ))}

              <div className="grid md:grid-cols-[185px_1fr_1fr]">
                <div />
                <div className="rounded-b-xl bg-[#1b100a] px-6 py-7 text-center">
                  <Button asChild size="lg" className="min-w-56 rounded-lg">
                    <Link href="/register">
                      {t("Simplify my applications")}
                      <span aria-hidden="true">
                        {locale === "ar" ? "←" : "→"}
                      </span>
                    </Link>
                  </Button>
                </div>
                <div className="hidden items-center px-8 text-sm italic leading-6 text-primary-300/75 md:flex">
                  {t(
                    "Spend your energy on the opportunity, not on repeating the form.",
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="bg-[#f1f1ed] py-16 sm:py-24">
          <div className="section-shell">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary-600">
                {t("Complete product-spec pricing")}
              </p>
              <h2 className="mt-4 text-4xl font-medium leading-[1.02] tracking-[-0.045em] sm:text-5xl">
                {t("Choose the support your search needs.")}
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-gray-600 sm:text-base">
                {t(
                  "Every current limit and every planned AI capability from the ApplyAI product specification is represented below. Planned features stay tucked away until you choose to view them.",
                )}
              </p>
            </div>

            <div className="mx-auto mt-10 grid max-w-5xl items-start gap-4 xl:grid-cols-3">
              {pricingPlans.map((plan) => (
                <Card
                  key={plan.name}
                  className={`relative flex flex-col overflow-hidden rounded-2xl p-0 shadow-none ${
                    plan.popular
                      ? "border-primary-500 bg-[#171714] text-white"
                      : "border-black/[0.08] bg-white"
                  }`}
                >
                  {plan.popular && (
                    <Badge className="absolute end-5 top-5 z-10 border-0 bg-primary-500 px-3 py-1 text-white">
                      {t("Most popular")}
                    </Badge>
                  )}
                  <div className="relative h-28 shrink-0 overflow-hidden">
                    <Image
                      src={plan.image}
                      alt={t(plan.imageAlt)}
                      fill
                      sizes="(max-width: 1280px) 100vw, 33vw"
                      className="object-cover"
                    />
                    <div
                      className={`absolute inset-0 ${plan.popular ? "bg-black/45" : "bg-black/30"}`}
                    />
                    <p className="absolute bottom-3 start-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                      {t(plan.imageLabel)}
                    </p>
                  </div>

                  <div className="flex flex-col p-5">
                    <p
                      className={`text-sm font-bold ${plan.popular ? "text-white/65" : "text-gray-500"}`}
                    >
                      {t(plan.name)}
                    </p>
                    <p className="mt-3 flex items-end gap-1">
                      <span className="text-4xl font-semibold tracking-[-0.045em]">
                        {plan.price}
                      </span>
                      <span
                        className={`pb-1 text-sm ${plan.popular ? "text-white/45" : "text-gray-500"}`}
                      >
                        {t("/month")}
                      </span>
                    </p>
                    <p
                      className={`mt-3 min-h-10 text-sm leading-5 ${plan.popular ? "text-white/60" : "text-gray-600"}`}
                    >
                      {t(plan.description)}
                    </p>

                    <Separator
                      className={`my-5 ${plan.popular ? "bg-white/15" : "bg-black/[0.08]"}`}
                    />
                    <p
                      className={`text-xs font-bold uppercase tracking-[0.12em] ${plan.popular ? "text-white/45" : "text-gray-400"}`}
                    >
                      {t("Included")}
                    </p>
                    <ul className="mt-3 space-y-2.5 text-sm">
                      {plan.currentFeatures.slice(0, 3).map((feature) => (
                        <li key={feature} className="flex items-start gap-3">
                          <span
                            className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                              plan.popular ? "bg-primary-400" : "bg-primary-500"
                            }`}
                            aria-hidden="true"
                          />
                          <span
                            className={
                              plan.popular ? "text-white/78" : "text-gray-700"
                            }
                          >
                            {t(feature)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {(plan.currentFeatures.length > 3 ||
                      plan.roadmapFeatures.length > 0) && (
                      <details
                        className={`group mt-4 border-t ${
                          plan.popular
                            ? "border-white/10"
                            : "border-black/[0.07]"
                        }`}
                      >
                        <summary
                          className={`flex cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden ${
                            plan.popular
                              ? "text-primary-300"
                              : "text-primary-600"
                          }`}
                        >
                          <span>
                            <span className="group-open:hidden">
                              {t("More features")}
                            </span>
                            <span className="hidden group-open:inline">
                              {t("Less")}
                            </span>
                          </span>
                          <span
                            className="text-base transition-transform group-open:rotate-180"
                            aria-hidden="true"
                          >
                            ⌄
                          </span>
                        </summary>
                        <ul className="space-y-2.5 pb-2 text-sm">
                          {plan.currentFeatures.slice(3).map((feature) => (
                            <li
                              key={feature}
                              className="flex items-start gap-3"
                            >
                              <span
                                className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                                  plan.popular
                                    ? "bg-primary-400"
                                    : "bg-primary-500"
                                }`}
                                aria-hidden="true"
                              />
                              <span
                                className={
                                  plan.popular
                                    ? "text-white/72"
                                    : "text-gray-700"
                                }
                              >
                                {t(feature)}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {plan.roadmapFeatures.length > 0 && (
                          <>
                            <p
                              className={`mt-3 border-t pt-4 text-[10px] font-bold uppercase tracking-[0.12em] ${
                                plan.popular
                                  ? "border-white/10 text-white/40"
                                  : "border-black/[0.07] text-gray-400"
                              }`}
                            >
                              {t("Features coming")}
                            </p>
                            <ul className="mt-3 space-y-2.5 pb-2 text-sm">
                              {plan.roadmapFeatures.map((feature) => (
                                <li
                                  key={feature}
                                  className="flex items-start gap-3"
                                >
                                  <span
                                    className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                                      plan.popular
                                        ? "bg-white/30"
                                        : "bg-gray-400"
                                    }`}
                                    aria-hidden="true"
                                  />
                                  <span
                                    className={
                                      plan.popular
                                        ? "text-white/50"
                                        : "text-gray-500"
                                    }
                                  >
                                    {t(feature)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </details>
                    )}

                    <div className="mt-5">
                      <Button
                        asChild
                        size="lg"
                        variant={plan.popular ? "default" : "outline"}
                        className={`w-full rounded-xl ${
                          plan.popular
                            ? ""
                            : "border-black/10 bg-white shadow-none hover:bg-orange-50"
                        }`}
                      >
                        <Link
                          href={`/register?plan=${plan.name.toLowerCase()}`}
                        >
                          {t(plan.cta)}
                          <span aria-hidden="true">
                            {locale === "ar" ? "←" : "→"}
                          </span>
                        </Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <details className="group mx-auto mt-4 max-w-5xl rounded-2xl border border-black/[0.08] bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 p-5 [&::-webkit-details-marker]:hidden sm:px-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-600">
                    {t("Features coming")}
                  </p>
                  <h3 className="mt-1 text-xl font-semibold tracking-[-0.035em]">
                    {t("Teams, universities, and career services")}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-5 text-gray-600">
                    {t(
                      "Enterprise capabilities are planned and remain hidden until you choose to inspect them.",
                    )}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-gray-600">
                  <span className="group-open:hidden">{t("More")}</span>
                  <span className="hidden group-open:inline">{t("Less")}</span>
                </span>
              </summary>
              <div className="grid gap-3 border-t border-black/[0.07] p-6 sm:grid-cols-2 sm:p-8">
                {enterpriseFeatures.map((feature) => (
                  <p
                    key={feature}
                    className="border-s-2 border-primary-400 bg-[#f7f7f5] p-4 text-sm leading-6 text-gray-700"
                  >
                    {t(feature)}
                  </p>
                ))}
              </div>
            </details>
          </div>
        </section>

        <section className="w-full bg-[#ece7df]">
          <div className="bg-[#f4f1eb] py-11 sm:py-14">
            <div className="px-5 text-center sm:px-8">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary-600">
                {t("Companies in your job search")}
              </p>
              <p className="mt-2 text-sm text-gray-500">
                {t("Keep every opportunity organized, wherever you find it.")}
              </p>
            </div>

            <div
              className="company-logo-marquee mt-8 space-y-2.5"
              aria-label={t(
                "Companies you can include in your ApplyAI job search",
              )}
            >
              {companyLogoRows.map((row, rowIndex) => (
                <div
                  key={`company-row-${rowIndex}`}
                  className={`company-logo-row ${
                    rowIndex === 1 ? "company-logo-row-reverse" : ""
                  }`}
                >
                  {[0, 1].map((copyIndex) => (
                    <div
                      key={`company-row-${rowIndex}-copy-${copyIndex}`}
                      className="company-logo-group"
                      aria-hidden={copyIndex === 1}
                    >
                      {row.map((company) => (
                        <div
                          key={`${company.name}-${copyIndex}`}
                          className="flex h-16 w-36 shrink-0 items-center justify-center"
                          title={company.name}
                        >
                          <Image
                            src={company.logo}
                            alt={copyIndex === 0 ? `${company.name} logo` : ""}
                            width={112}
                            height={56}
                            sizes="112px"
                            loading="eager"
                            className="max-h-14 w-auto max-w-28 object-contain grayscale opacity-50 transition duration-300 hover:grayscale-0 hover:opacity-100"
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/[0.06] bg-white py-14">
        <div className="section-shell">
          <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <Link
                href="/"
                aria-label={t("ApplyAI home")}
                className="inline-flex"
              >
                <ApplyAILogo className="h-9 w-auto" />
              </Link>
              <p className="mt-4 max-w-sm text-sm leading-6 text-gray-500">
                {t(
                  "A responsible AI workspace for finding, preparing, submitting, and tracking your next opportunity.",
                )}
              </p>
              <p className="mt-5 border-s-2 border-primary-500 ps-3 text-xs font-semibold text-gray-500">
                {t("Human-approved by design")}
              </p>
            </div>
            <FooterGroup
              title={t("Product")}
              links={[
                [t("Features"), "#features"],
                [t("How it works"), "#how-it-works"],
                [t("Job matches"), "#jobs"],
                [t("Pricing"), "#pricing"],
              ]}
            />
            <FooterGroup
              title={t("Account")}
              links={[
                [t("Sign in"), "/login"],
                [t("Create account"), "/register"],
                [t("Connect extension"), "/extension/connect"],
                [t("Dashboard"), "/dashboard"],
              ]}
            />
            <FooterGroup
              title={t("Trust")}
              links={[
                [t("Privacy"), "/privacy"],
                [t("Terms"), "/terms"],
                [t("Responsible autofill"), "#comparison"],
                [t("Secure resume storage"), "#pricing"],
              ]}
            />
          </div>
          <Separator className="my-9" />
          <div className="flex flex-col justify-between gap-3 text-xs text-gray-400 sm:flex-row">
            <p>{t("© 2026 ApplyAI. All rights reserved.")}</p>
            <p>{t("AI support for a clearer, controlled job search.")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function TrustIllustration({ variant }: { variant: number }) {
  const orange = "#f2752c";
  const ink = "#262621";
  const paper = "#fffaf5";
  const muted = "#d9d0c7";

  return (
    <span
      className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eee8e0]"
      aria-hidden="true"
    >
      <svg viewBox="0 0 80 58" className="h-full w-full" fill="none">
        <path
          d="M-4 51C15 35 31 52 47 40C61 30 70 34 84 23V62H-4V51Z"
          fill="#e1d6ca"
        />
        {variant === 0 && (
          <>
            <circle cx="30" cy="23" r="10" fill={muted} />
            <path
              d="M14 52C15 37 20 30 30 30C40 30 45 37 46 52H14Z"
              fill={orange}
            />
            <circle cx="53" cy="19" r="8" fill={ink} />
            <path
              d="M42 44C43 32 47 27 53 27C61 27 65 33 66 44H42Z"
              fill={paper}
            />
          </>
        )}
        {variant === 1 && (
          <>
            <rect x="18" y="8" width="40" height="46" rx="7" fill={paper} />
            <path
              d="M27 20H49M27 28H46M27 36H41"
              stroke={muted}
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M43 45L48 49L57 39"
              stroke={orange}
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
        {variant === 2 && (
          <>
            <rect x="12" y="18" width="43" height="32" rx="8" fill={ink} />
            <rect x="24" y="10" width="43" height="32" rx="8" fill={paper} />
            <circle cx="45" cy="26" r="8" fill={orange} />
            <path
              d="M45 22V29"
              stroke={paper}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="45" cy="31" r="1.5" fill={paper} />
          </>
        )}
        {variant === 3 && (
          <>
            <path
              d="M19 39L38 19L61 37"
              stroke={ink}
              strokeWidth="4"
              strokeLinecap="round"
            />
            <circle
              cx="19"
              cy="39"
              r="8"
              fill={paper}
              stroke={orange}
              strokeWidth="3"
            />
            <circle
              cx="38"
              cy="19"
              r="8"
              fill={paper}
              stroke={orange}
              strokeWidth="3"
            />
            <circle cx="61" cy="37" r="8" fill={ink} />
          </>
        )}
      </svg>
    </span>
  );
}

function WorkflowDashboard({
  activeStep,
  locale,
}: {
  activeStep: (typeof steps)[number];
  locale: LandingLocale;
}) {
  const t = (text: string) => translateLanding(locale, text);
  const summaryCards = [
    [t("Applications"), "12", t("4 ready to review")],
    [t("Profile completion"), "92%", t("Two details to add")],
    [t("Average match"), "89%", t("Across saved roles")],
    [t("Replies"), "3", t("This week")],
  ];

  return (
    <div className="overflow-hidden rounded-[22px] border border-black/[0.08] bg-[#f8f8f6] text-[#1b1b18] shadow-[0_18px_50px_rgba(35,28,21,0.11)]">
      <div className="flex min-h-[62px] items-center justify-between gap-4 border-b border-black/[0.07] bg-white px-4 sm:px-6">
        <ApplyAILogo className="h-6 w-auto" />
        <div className="hidden items-center gap-1 md:flex">
          {["Overview", "Resumes", "Jobs", "Applications"].map((item) => (
            <span
              key={item}
              className={`rounded-lg px-3 py-2 text-xs font-medium ${
                item === "Overview"
                  ? "bg-orange-50 text-primary-700"
                  : "text-gray-500"
              }`}
            >
              {t(item)}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-end text-xs leading-4 text-gray-500 sm:block">
            <span className="block font-semibold text-gray-800">
              Amira Morgan
            </span>
            {t("Candidate workspace")}
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1b1b18] text-xs font-semibold text-white">
            AM
          </span>
        </div>
      </div>

      <div className="grid min-h-[500px] lg:grid-cols-[202px_minmax(0,1fr)]">
        <aside className="hidden border-e border-black/[0.07] bg-[#fbfaf8] p-4 lg:block">
          <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
            {t("Workspace")}
          </p>
          <div className="mt-3 space-y-1">
            {[
              "Overview",
              "Saved jobs",
              "Applications",
              "Documents",
              "Settings",
            ].map((item) => (
              <span
                key={item}
                className={`block rounded-lg px-3 py-2.5 text-sm ${
                  item === "Overview"
                    ? "bg-primary-500 text-white"
                    : "text-gray-600"
                }`}
              >
                {t(item)}
              </span>
            ))}
          </div>
          <div className="mt-8 rounded-xl border border-black/[0.07] bg-white p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-600">
              {t("Search status")}
            </p>
            <p className="mt-2 text-sm font-semibold">
              {t("Focused and active")}
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              {t("Three roles are ready for your review.")}
            </p>
          </div>
        </aside>

        <div className="min-w-0 p-4 sm:p-6 lg:p-7">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.13em] text-primary-600">
                {t("Overview")}
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
                {t("Good morning, Amira.")}
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                {t("Here is your live job-search overview.")}
              </p>
            </div>
            <span className="w-fit rounded-full border border-primary-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-primary-700">
              {t("3 applications ready")}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {summaryCards.map(([label, value, detail]) => (
              <div
                key={label}
                className="rounded-xl border border-black/[0.07] bg-white p-4"
              >
                <p className="text-[11px] font-medium text-gray-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                  {value}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-gray-400">
                  {detail}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.28fr_0.72fr]">
            <section className="rounded-xl border border-black/[0.07] bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">{t("Best matches")}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {t("Roles selected for your profile")}
                  </p>
                </div>
                <span className="text-xs font-medium text-primary-600">
                  {t("View all")}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {jobs.slice(0, 2).map((job) => (
                  <div
                    key={job.role}
                    className="flex items-center gap-3 rounded-xl bg-[#f8f7f5] p-3"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-black/[0.06] bg-white">
                      <Image
                        src={job.logo}
                        alt={`${job.company} logo`}
                        width={22}
                        height={22}
                        className="h-5 w-5 object-contain"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {t(job.role)}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {job.company} · {t(job.location)}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#eaf3e6] px-2.5 py-1 text-xs font-semibold text-[#436039]">
                      {job.score}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl bg-[#1b1b18] p-4 text-white sm:p-5">
              <p className="text-[10px] font-medium uppercase tracking-[0.13em] text-primary-300">
                {t("Application readiness")}
              </p>
              <p className="mt-2 text-lg font-semibold tracking-[-0.025em]">
                {t("Your profile is almost ready.")}
              </p>
              <div className="mt-5 space-y-3">
                {[
                  ["Resume", "96%"],
                  ["Role fit", "94%"],
                  ["Cover letter", "89%"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs text-white/65">
                      <span>{t(label)}</span>
                      <span>{value}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15">
                      <span
                        className="block h-full rounded-full bg-primary-500"
                        style={{ width: value }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-white/55">
                {t(
                  "Every suggestion remains grounded in the information you provided.",
                )}
              </p>
            </section>
          </div>

          <div className="mt-5 flex flex-col gap-4 rounded-xl border border-primary-200 bg-orange-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-500 text-sm font-semibold text-white">
                {activeStep.number}
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-primary-700">
                  {t("Workspace focus")}
                </p>
                <p className="mt-0.5 text-sm font-semibold">
                  {activeStep.title}
                </p>
              </div>
            </div>
            <p className="max-w-md text-xs leading-5 text-gray-600">
              {activeStep.description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FooterGroup({
  title,
  links,
}: {
  title: string;
  links: Array<[string, string]>;
}) {
  return (
    <div>
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      <ul className="mt-4 space-y-3">
        {links.map(([label, href]) => (
          <li key={label}>
            <Link
              href={href}
              className="text-sm text-gray-500 transition hover:text-primary-600"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
