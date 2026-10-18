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
      className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eee8e0]"
      aria-hidden="true"
    >
      <Image
        src={illustrations[variant]}
        alt=""
        width={64}
        height={48}
        sizes="64px"
        className="h-full w-full object-contain"
      />
    </span>
  );
}
