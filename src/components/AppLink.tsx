import type { AnchorHTMLAttributes, ReactNode } from 'react';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  children: ReactNode;
};

export default function AppLink({ href, children, ...props }: Props) {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}
