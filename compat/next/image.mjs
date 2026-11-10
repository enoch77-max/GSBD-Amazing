import { createElement, forwardRef, useState } from "react";

const FALLBACK =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f5f2e9"/><stop offset="55%" stop-color="#e8e6d6"/><stop offset="100%" stop-color="#d8e7b4"/>
      </linearGradient></defs>
      <rect width="400" height="400" fill="url(#g)"/>
      <g fill="none" stroke="#0b1712" stroke-opacity="0.42" stroke-width="9" stroke-linecap="round">
        <rect x="150" y="128" width="100" height="150" rx="16"/>
        <path d="M182 128v-16h36v16"/>
        <path d="M204 168l-22 44h34l-20 40"/>
      </g>
    </svg>`,
  );

function resolve(src) {
  if (typeof src !== "string") return src;
  const resolver = globalThis.__gsbdAsset;
  return typeof resolver === "function" ? resolver(src) : src;
}

const Image = forwardRef(function Image(props, ref) {
  const {
    src,
    alt = "",
    fill = false,
    sizes,
    priority = false,
    quality,
    loader,
    placeholder,
    blurDataURL,
    unoptimized,
    width,
    height,
    style,
    onError,
    onLoad,
    loading,
    fetchPriority,
    ...rest
  } = props;

  void sizes;
  void quality;
  void loader;
  void placeholder;
  void blurDataURL;
  void unoptimized;

  const [failed, setFailed] = useState(false);
  const resolved = failed ? FALLBACK : resolve(typeof src === "string" ? src : "");

  const fillStyle = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style }
    : style;

  return createElement("img", {
    ...rest,
    ref,
    src: resolved,
    alt,
    width: fill ? undefined : width,
    height: fill ? undefined : height,
    loading: loading ?? (priority ? "eager" : "lazy"),
    decoding: "async",
    fetchPriority: fetchPriority ?? (priority ? "high" : undefined),
    draggable: false,
    style: fillStyle,
    onLoad,
    onError(event) {
      if (!failed) setFailed(true);
      if (typeof onError === "function") onError(event);
    },
  });
});

export default Image;
