import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

/**
 * Atomic-design placeholder atom. Real variants (primary/secondary/danger)
 * arrive with the first feature slice that needs them.
 */
export function Button({ children, ...props }: ButtonProps) {
  return (
    <button type="button" className="rounded-md bg-slate-900 px-3 py-2 text-white" {...props}>
      {children}
    </button>
  );
}
