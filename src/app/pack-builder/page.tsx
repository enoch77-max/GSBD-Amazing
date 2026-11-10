import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PackBuilder } from "@/components/pack-builder/PackBuilder";

export default function PackBuilderPage() {
  return (
    <div className="pack-page">
      <div className="shell builder-shell">
        <Link href="/shop" className="builder-back"><ArrowLeft size={14} /> Back to the shop</Link>
        <header className="builder-page-heading">
          <div><p className="builder-page-eyebrow">GLOWING SPACE / WORKSHOP SERVICES</p><h1>Build your battery pack<span>.</span></h1><p>Choose your cells and configuration. We’ll show you exactly what goes into your build.</p></div>
          <div className="builder-heading-aside"><span>MADE TO ORDER</span><strong>Built for your next project.</strong><p>Assembled and tested by the Glowing Space workshop.</p></div>
        </header>
        <PackBuilder />
        <p className="builder-bottom-help">Need something different? <Link href="/help/wholesale">Talk to the workshop <ArrowRight size={13} /></Link></p>
      </div>
    </div>
  );
}
