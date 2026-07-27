import Link from 'next/link';
import { ArrowLeft, Check, ShieldCheck, Sparkles } from 'lucide-react';
import { ApplyAILogo } from '@/components/brand/ApplyAILogo';

const benefits = [
  'Grounded resume optimization',
  'Job-specific match intelligence',
  'One private application workspace',
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f7f5] lg:grid lg:grid-cols-[0.9fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-[#171717] p-12 text-white lg:flex lg:min-h-screen lg:flex-col lg:justify-between">
        <div className="product-grid absolute inset-0 opacity-[0.08]" />
        <div className="absolute -left-20 top-1/4 h-96 w-96 rounded-full bg-primary-500/25 blur-[120px]" />

        <Link
          href="/"
          aria-label="ApplyAI home"
          className="relative inline-flex w-fit rounded-xl bg-white px-3 py-2"
        >
          <ApplyAILogo className="h-8 w-auto" priority />
        </Link>

        <div className="relative max-w-xl">
          <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-500">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="text-5xl font-bold leading-[1.05] tracking-[-0.05em]">
            Your next opportunity deserves a smarter search.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-white/55">
            Bring your real experience. ApplyAI helps you find the fit, prepare
            stronger applications, and keep every next step clear.
          </p>

          <ul className="mt-9 space-y-4">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-3 text-sm text-white/80">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10">
                  <Check className="h-3.5 w-3.5 text-orange-300" />
                </span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-white/40">
          <ShieldCheck className="h-4 w-4" />
          Privacy-first sessions and responsible AI guardrails
        </div>
      </aside>

      <main className="relative flex min-h-screen items-center justify-center px-5 py-16 sm:px-8">
        <div className="product-grid absolute inset-0 opacity-40" />
        <div className="relative w-full max-w-md">
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <Link href="/" aria-label="ApplyAI home">
              <ApplyAILogo className="h-8 w-auto" priority />
            </Link>
            <Link href="/" className="flex items-center gap-1 text-sm font-medium text-gray-500">
              <ArrowLeft className="h-4 w-4" />
              Home
            </Link>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
