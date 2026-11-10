import type { ImgHTMLAttributes, Ref } from "react";
import type * as React from "react";
export type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height" | "placeholder"> & {
  src: string;
  alt: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  sizes?: string;
  priority?: boolean;
  quality?: number;
  placeholder?: "empty" | "blur";
  blurDataURL?: string;
  unoptimized?: boolean;
  loader?: (args: { src: string; width: number; quality?: number }) => string;
  ref?: Ref<HTMLImageElement>;
};
declare const Image: (props: ImageProps) => React.JSX.Element;
export default Image;
