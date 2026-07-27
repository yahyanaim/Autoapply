import Image from 'next/image';
import { cn } from '@/lib/utils';

interface ApplyAILogoProps {
  className?: string;
  mark?: boolean;
  priority?: boolean;
}

export function ApplyAILogo({
  className,
  mark = false,
  priority = false,
}: ApplyAILogoProps) {
  return (
    <Image
      src={mark ? '/images/applyai-mark.png' : '/images/applyai-logo.png'}
      alt="ApplyAI"
      width={mark ? 512 : 645}
      height={mark ? 512 : 192}
      priority={priority}
      className={cn('shrink-0 object-contain', className)}
    />
  );
}
