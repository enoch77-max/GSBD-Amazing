import { createElement, forwardRef } from "react";
import { navigate } from "./router-core.mjs";

function isModifiedEvent(event) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

const Link = forwardRef(function Link(props, ref) {
  const {
    href,
    children,
    replace = false,
    scroll = true,
    prefetch,
    legacyBehavior,
    onClick,
    target,
    ...rest
  } = props;

  void prefetch;
  void legacyBehavior;

  const to = typeof href === "string" ? href : String(href ?? "/");
  const external = /^[a-z][a-z0-9+.-]*:/i.test(to) || to.startsWith("//");

  return createElement(
    "a",
    {
      ...rest,
      ref,
      target,
      href: external ? to : to.startsWith("/") ? to : `/${to}`,
      onClick(event) {
        if (typeof onClick === "function") onClick(event);
        if (event.defaultPrevented) return;
        if (external || (target && target !== "_self")) return;
        if (isModifiedEvent(event)) return;
        event.preventDefault();
        navigate(to, { replace, scroll });
      },
    },
    children,
  );
});

export default Link;
