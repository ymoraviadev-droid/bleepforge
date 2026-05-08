import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router";

export type ButtonVariant = "primary" | "danger" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "btn-pixel border-2 border-black/40 bg-emerald-600 text-white hover:bg-emerald-500",
  danger:
    "btn-pixel border-2 border-black/40 bg-red-700 text-white hover:bg-red-600",
  secondary:
    "btn-pixel border-2 border-black/40 bg-neutral-800 text-neutral-100 hover:bg-neutral-700",
  ghost: "text-neutral-400 hover:text-neutral-200",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-2 py-1 text-xs",
  md: "px-3 py-1.5 text-sm",
};

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children?: ReactNode;
}

export type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", type = "button", ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={`${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} font-medium disabled:opacity-50 ${className}`}
      {...rest}
    />
  ),
);
Button.displayName = "Button";

export type ButtonLinkProps = BaseProps & Omit<LinkProps, "className">;

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      className={`${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} inline-block font-medium ${className}`}
      {...rest}
    />
  );
}
