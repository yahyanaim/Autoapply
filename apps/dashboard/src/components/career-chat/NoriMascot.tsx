import Image from "next/image";
import { useId } from "react";

/** Original artwork with image-only movement and aligned, decorative eyelids. */
export function NoriMascot({
  compact = false,
  thinking = false,
}: {
  compact?: boolean;
  thinking?: boolean;
}) {
  const instanceId = useId().replaceAll(":", "");
  const eyeClip = `nori-eye-clip-${instanceId}`;
  const leftFur = `nori-left-fur-${instanceId}`;
  const rightFur = `nori-right-fur-${instanceId}`;
  const grain = `nori-eyelid-grain-${instanceId}`;

  return (
    <span className="nori-mascot-head-shake relative block h-full w-full">
      <Image
        src="/images/nori/nori-fox.png"
        alt="Nori, ApplyAI career assistant"
        width={1254}
        height={1254}
        sizes={compact ? "44px" : "(max-width: 639px) 71px, 84px"}
        className="h-full w-full object-contain"
        data-nori-mascot="static-fox"
        data-thinking={thinking || undefined}
        draggable={false}
      />
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1254 1254"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
        data-nori-blink=""
      >
        <defs>
          <clipPath id={eyeClip}>
            <path d="M349 562 C385 533 406 507 440 513 C499 513 528 584 513 690 L365 622 C361 590 359 575 349 562Z M762 736 C769 682 803 628 841 606 C884 576 925 603 947 681 C930 706 921 727 906 734Z" />
          </clipPath>
          <linearGradient id={leftFur} x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#fc9f45" />
            <stop offset="1" stopColor="#ffbb65" />
          </linearGradient>
          <linearGradient id={rightFur} x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#ffb056" />
            <stop offset="1" stopColor="#ffca7f" />
          </linearGradient>
          <filter id={grain}>
            <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="8" result="noise" />
            <feColorMatrix in="noise" type="saturate" values="0" />
            <feComponentTransfer><feFuncA type="linear" slope=".1" /></feComponentTransfer>
            <feBlend in="SourceGraphic" mode="soft-light" />
          </filter>
        </defs>
        <g clipPath={`url(#${eyeClip})`}>
          <g className="nori-mascot-eyelid" data-eye="left">
            <g filter={`url(#${grain})`}>
              <path fill={`url(#${leftFur})`} d="M333 486H532V700H333Z" />
              <path fill="#ffad58" opacity=".5" d="M342 549L437 514L502 677Z" />
            </g>
          </g>
          <g className="nori-mascot-eyelid" data-eye="right">
            <g filter={`url(#${grain})`}>
              <path fill={`url(#${rightFur})`} d="M733 566H958V744H733Z" />
              <path fill="#ffba67" opacity=".6" d="M750 720L829 591L919 711Z" />
            </g>
          </g>
          <g className="nori-mascot-closed-eyes" fill="none" stroke="#432a18" strokeWidth="10" strokeLinecap="round">
            <path d="M362 589Q419 639 508 636" />
            <path d="M777 691Q842 723 932 680" />
          </g>
        </g>
      </svg>
    </span>
  );
}
