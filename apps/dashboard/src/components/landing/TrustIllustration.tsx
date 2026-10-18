import Image from "next/image";

const illustrations = [
  "/images/trust/human-approved.webp",
  "/images/trust/truthful-by-design.webp",
  "/images/trust/encrypted-storage.webp",
  "/images/trust/official-sources.webp",
];

export function TrustIllustration({ variant }: { variant: number }) {
  return (
    <span
      className="flex h-28 w-28 shrink-0 items-center justify-center sm:h-40 sm:w-full lg:h-44"
      aria-hidden="true"
    >
      <Image
        src={illustrations[variant]}
        alt=""
        width={576}
        height={576}
        sizes="(min-width: 1024px) 176px, (min-width: 640px) 160px, 112px"
        className="h-full w-full object-contain"
      />
    </span>
  );
}
