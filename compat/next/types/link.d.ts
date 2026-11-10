import type { AnchorHTMLAttributes, ReactNode, Ref } from "react";
import type * as React from "react";
export type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children?: ReactNode;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean;
  legacyBehavior?: boolean;
  ref?: Ref<HTMLAnchorElement>;
};
declare const Link: (props: LinkProps) => React.JSX.Element;
export default Link;
