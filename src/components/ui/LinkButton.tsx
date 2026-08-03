import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react';
import styles from './LinkButton.module.css';

export type LinkButtonVariant = 'link' | 'button';

type CommonProps = {
  /** Visual variant: an amber text link or a button-shaped control. */
  variant?: LinkButtonVariant;
  className?: string;
  children: ReactNode;
};

type AsAnchor = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
    href: string;
    /** External links open in a new tab with rel="noreferrer noopener". */
    external?: boolean;
  };

type AsButton = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

export type LinkButtonProps = AsAnchor | AsButton;

/**
 * LinkButton — the amber call-to-action. With an href it renders an <a>,
 * otherwise a <button>. The `button` variant is button-shaped with a ≥44px
 * touch target; both variants carry the 2px amber :focus-visible ring at
 * offset 2 (DESIGN.md §4, §7).
 */
export default function LinkButton(props: LinkButtonProps) {
  const classes = [styles.base, styles[props.variant ?? 'link'], props.className]
    .filter(Boolean)
    .join(' ');

  if (props.href !== undefined) {
    const {
      href,
      external,
      variant: _variant,
      className: _className,
      children,
      ...rest
    } = props;
    void _variant;
    void _className;
    const externalProps = external
      ? { target: '_blank', rel: 'noreferrer noopener' }
      : {};
    return (
      <a href={href} className={classes} {...externalProps} {...rest}>
        {children}
      </a>
    );
  }

  const {
    variant: _variant,
    className: _className,
    children,
    type,
    ...rest
  } = props;
  void _variant;
  void _className;
  return (
    <button type={type ?? 'button'} className={classes} {...rest}>
      {children}
    </button>
  );
}
