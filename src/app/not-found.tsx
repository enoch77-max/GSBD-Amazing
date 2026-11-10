import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="shell py-8 sm:py-12">
      <div className="mx-auto max-w-lg rounded-2xl border border-line bg-cream p-5 sm:p-7">
        <p className="text-xs font-medium text-muted">404 · Page not found</p>
        <h1 className="mt-2 text-2xl">This page isn’t available.</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">The link may have changed. Search for the item or browse all products.</p>
        <div className="mt-4 flex flex-wrap gap-2"><Link href="/shop" className="btn btn-primary btn-sm min-h-11"><Search size={15} /> Browse products</Link><Link href="/" className="btn btn-outline btn-sm min-h-11"><ArrowLeft size={15} /> Home</Link></div>
      </div>
    </div>
  );
}
