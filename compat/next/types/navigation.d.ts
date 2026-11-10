export declare function useRouter(): {
  push(href: string, options?: { scroll?: boolean }): void;
  replace(href: string, options?: { scroll?: boolean }): void;
  back(): void;
  forward(): void;
  refresh(): void;
  prefetch(href: string): Promise<void>;
};
export declare function usePathname(): string;
export declare function useSearchParams(): URLSearchParams;
export declare function useParams<T = Record<string, string>>(): T;
export declare function useSelectedLayoutSegment(): string | null;
export declare function useSelectedLayoutSegments(): string[];
export declare function notFound(): never;
export declare function redirect(href: string, type?: "push" | "replace"): never;
export declare function permanentRedirect(href: string): never;
