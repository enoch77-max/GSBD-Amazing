import { Component, Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from "react";
import { RouteParamsContext, navigate, splitUrl, useRouteSnapshot } from "next/router-core.mjs";
import RootLayout from "@/app/layout";
import HomePage from "@/app/page";
import ShopPage from "@/app/shop/page";
import ProductPage from "@/app/product/[slug]/page";
import CheckoutPage from "@/app/checkout/page";
import TrackPage from "@/app/track/page";
import OrderPage from "@/app/order/[number]/page";
import AboutPage from "@/app/about/page";
import SupportPage from "@/app/support/page";
import PackBuilderPage from "@/app/pack-builder/page";
import WishlistPage from "@/app/wishlist/page";
import HelpPage from "@/app/help/page";
import HelpTopicPage from "@/app/help/[topic]/page";
import NotFound from "@/app/not-found";
import { isLive } from "@/lib/live";

const AdminPage = lazy(() => import("@/app/admin/page"));
const OwnerApp = lazy(() => import("@/owner/OwnerApp"));

function AdminShell() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#8aa697", background: "#08120e" }}>
          Loading console…
        </div>
      }
    >
      {isLive() ? <OwnerApp /> : <AdminPage />}
    </Suspense>
  );
}
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import RefundsPage from "@/app/refunds/page";
import { initAnalytics, track, trackPageView } from "@/lib/analytics";
import { readProductBySlug } from "@/lib/queries";

type Route = {
  pattern: RegExp;
  keys: string[];
  element: () => ReactNode;
  title: (params: Record<string, string>) => string;
};

const SUFFIX = " · Glowing Space BD";

const ROUTES: Route[] = [
  {
    pattern: /^\/$/,
    keys: [],
    element: () => <HomePage />,
    title: () => "Glowing Space BD — Batteries, UPS & DIY electronics",
  },
  {
    pattern: /^\/shop$/,
    keys: [],
    element: () => <ShopPage />,
    title: () => `Shop batteries, UPS & electronics${SUFFIX}`,
  },
  {
    pattern: /^\/product\/([^/]+)$/,
    keys: ["slug"],
    element: () => <ProductPage />,
    title: ({ slug }) => {
      const product = readProductBySlug(decodeURIComponent(slug ?? ""));
      return product ? `${product.name}${SUFFIX}` : `Product not found${SUFFIX}`;
    },
  },
  {
    pattern: /^\/checkout$/,
    keys: [],
    element: () => <CheckoutPage />,
    title: () => `Checkout${SUFFIX}`,
  },
  {
    pattern: /^\/track$/,
    keys: [],
    element: () => <TrackPage />,
    title: () => `Track order${SUFFIX}`,
  },
  {
    pattern: /^\/order\/([^/]+)$/,
    keys: ["number"],
    element: () => <OrderPage />,
    title: ({ number }) => `Order ${decodeURIComponent(number ?? "")}${SUFFIX}`,
  },
  {
    pattern: /^\/privacy$/,
    keys: [],
    element: () => <PrivacyPage />,
    title: () => `Privacy policy${SUFFIX}`,
  },
  {
    pattern: /^\/terms$/,
    keys: [],
    element: () => <TermsPage />,
    title: () => `Terms of sale${SUFFIX}`,
  },
  {
    pattern: /^\/refunds$/,
    keys: [],
    element: () => <RefundsPage />,
    title: () => `Returns, refunds & warranty${SUFFIX}`,
  },
  {
    pattern: /^\/admin$/,
    keys: [],
    element: () => <AdminShell />,
    title: () => "Merchant console · Glowing Space BD",
  },
  {
    pattern: /^\/about$/,
    keys: [],
    element: () => <AboutPage />,
    title: () => `About & location${SUFFIX}`,
  },
  {
    pattern: /^\/support$/,
    keys: [],
    element: () => <SupportPage />,
    title: () => `Help & support${SUFFIX}`,
  },
  {
    pattern: /^\/pack-builder$/,
    keys: [],
    element: () => <PackBuilderPage />,
    title: () => `Custom battery pack builder${SUFFIX}`,
  },
  {
    pattern: /^\/wishlist$/,
    keys: [],
    element: () => <WishlistPage />,
    title: () => `Your wishlist${SUFFIX}`,
  },
  {
    pattern: /^\/help$/,
    keys: [],
    element: () => <HelpPage />,
    title: () => `Help centre${SUFFIX}`,
  },
  {
    pattern: /^\/help\/([^/]+)$/,
    keys: ["topic"],
    element: () => <HelpTopicPage />,
    title: ({ topic }) => `${topic ? topic.replace(/-/g, " ") : "Help"}${SUFFIX}`,
  },
];

function match(pathname: string) {
  for (const route of ROUTES) {
    const found = route.pattern.exec(pathname);
    if (!found) continue;
    const params: Record<string, string> = {};
    route.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(found[index + 1] ?? "");
    });
    return { route, params };
  }
  return null;
}

const NOT_FOUND_DIGEST = Symbol.for("gsbd.notFound");
const REDIRECT_DIGEST = Symbol.for("gsbd.redirect");

class RouteBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    const digest = (error as { digest?: symbol; destination?: string })?.digest;
    if (digest === REDIRECT_DIGEST) {
      const destination = (error as { destination?: string }).destination ?? "/";
      window.setTimeout(() => navigate(destination, { replace: true }), 0);
      return;
    }
    if (digest !== NOT_FOUND_DIGEST) console.error("[router]", error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const digest = (error as { digest?: symbol })?.digest;
    if (digest === NOT_FOUND_DIGEST) return <NotFound />;
    if (digest === REDIRECT_DIGEST) return null;
    return (
      <div className="shell py-10">
        <div className="mx-auto max-w-lg rounded-2xl border border-line bg-cream p-6">
          <p className="eyebrow text-muted">Something slipped</p>
          <h1 className="mt-2 text-2xl">This page hit a loose connection</h1>
          <p className="mt-2 text-sm text-muted">
            The rest of the shop is still running. Reload the page, or head back to the catalogue.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
              Reload page
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate("/shop")}>
              Browse the shop
            </button>
          </div>
        </div>
      </div>
    );
  }
}

function useRouteInfo() {
  const snapshot = useRouteSnapshot();
  return useMemo(() => {
    const { pathname, hash } = splitUrl(snapshot.url);
    return { pathname, hash, matched: match(pathname), version: snapshot.version };
  }, [snapshot]);
}

export default function App() {
  const { pathname, hash, matched } = useRouteInfo();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    initAnalytics();
  }, []);

  /* One PageView per navigation, plus ViewContent when a product page opens. */
  useEffect(() => {
    if (!ready || pathname.startsWith("/admin")) return;
    trackPageView(pathname);
    const slug = matched?.params.slug;
    if (slug) {
      const product = readProductBySlug(decodeURIComponent(slug));
      if (product) {
        track("ViewContent", {
          content_ids: [product.slug],
          content_name: product.name,
          content_category: product.categorySlug,
          content_type: "product",
          value: product.price,
        });
      }
    }
  }, [ready, pathname, matched]);

  useEffect(() => {
    document.title = matched ? matched.route.title(matched.params) : `Page not found${SUFFIX}`;
  }, [matched, pathname]);

  useEffect(() => {
    if (!hash) return;
    let attempts = 0;
    const scroll = () => {
      attempts += 1;
      const target = document.getElementById(decodeURIComponent(hash));
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      else if (attempts < 12) window.setTimeout(scroll, 60);
    };
    const timer = window.setTimeout(scroll, 80);
    return () => window.clearTimeout(timer);
  }, [hash, pathname]);

  const params = matched?.params ?? {};

  /* The console is a separate application surface — no storefront header/footer. */
  if (pathname.startsWith("/admin")) {
    return (
      <RouteBoundary key="admin">
        <AdminShell />
      </RouteBoundary>
    );
  }

  return (
    <RootLayout>
      <RouteBoundary key={pathname}>
        <RouteParamsContext.Provider value={params}>
          <div key={pathname} className={ready ? "route-view" : undefined}>
            {matched ? matched.route.element() : <NotFound />}
          </div>
        </RouteParamsContext.Provider>
      </RouteBoundary>
    </RootLayout>
  );
}
