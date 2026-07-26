import React from 'react';

interface ActionButtonProps {
  variant: 'primary' | 'secondary';
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  ariaLabel: string;
}

export function ActionButton({
  variant,
  onClick,
  disabled = false,
  children,
  ariaLabel,
}: ActionButtonProps) {
  const baseStyles =
    'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2';

  const variantStyles = {
    primary:
      'bg-primary text-white hover:bg-primary-hover active:scale-[0.98]',
    secondary:
      'bg-gray-100 text-gray-900 border border-gray-200 hover:bg-primary-light hover:border-primary hover:text-primary',
  };

  const disabledStyles = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${baseStyles} ${variantStyles[variant]} ${disabledStyles}`}
    >
      {children}
    </button>
  );
}
