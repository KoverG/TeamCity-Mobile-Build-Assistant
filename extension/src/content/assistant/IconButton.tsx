import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
  tone: 'primary' | 'muted'
  decorative?: boolean
}

export function IconButton({
  label,
  children,
  className = '',
  tone,
  decorative = false,
  onClick,
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      className={`tcba-icon-button tcba-icon-button--${tone} ${className}`.trim()}
      type="button"
      aria-label={label}
      aria-disabled={decorative || props['aria-disabled']}
      tabIndex={decorative ? -1 : props.tabIndex}
      onClick={decorative ? undefined : onClick}
    >
      {children}
    </button>
  )
}
