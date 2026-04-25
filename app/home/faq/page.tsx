import Link from "next/link";

import { ArrowRight, ChevronDown } from "@/lib/icons";
import { MarketingSubpageShell } from "@/components/marketing/marketing-subpage-shell";
import { Reveal } from "@/components/marketing/motion";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/marketing-site.module.css";

const faqCategories = [
  {
    title: "Pricing & Plans",
    questions: [
      { q: "How much does Corelith cost?", a: "Plans start at $39/month. Growth is $99/month. Business is $199/month. See the full pricing page for details." },
      { q: "Is there a free trial?", a: "Yes. 14 days, no credit card required. Full access to your chosen plan." },
      { q: "Is there a contract?", a: "No. Monthly billing. Cancel anytime with one click." },
      { q: "Can I change plans?", a: "Yes. Upgrade or downgrade anytime. Changes take effect on your next billing date." },
      { q: "What's included in each plan?", a: "Starter: 1 site, 2 users, 1 module. Growth: 3 sites, 10 users, 3 modules. Business: 8 sites, 25 users, all modules. See our pricing page for a full comparison." },
      { q: "Do you offer discounts?", a: "Annual plans get 2 months free. We also offer discounts for businesses with 3+ subscriptions." },
      { q: "What currency do you bill in?", a: "USD. We accept bank transfer, EcoCash, and mobile money." },
    ],
  },
  {
    title: "Setup & Getting Started",
    questions: [
      { q: "How long does setup take?", a: "5 minutes to create your account and add your first site. Adding users and stock takes another 10-15 minutes." },
      { q: "Do I need technical skills?", a: "No. If you can use WhatsApp, you can use Corelith. We designed it for business owners, not IT departments." },
      { q: "Do I need a computer?", a: "No. Corelith works on any phone, tablet, or computer. It's a web app — no installation needed." },
      { q: "Can I import my existing data?", a: "Yes. We support Excel imports for products, employees, and stock. Or start fresh — many customers prefer a clean start." },
      { q: "How do I add my team?", a: "From the admin panel, invite users by email or phone. They get a link to set up their account." },
    ],
  },
  {
    title: "Offline & Connectivity",
    questions: [
      { q: "What if the internet goes down?", a: "Corelith works offline. Your data stores on your device and syncs automatically when the internet returns." },
      { q: "Does it work on slow internet?", a: "Yes. We optimize for low-bandwidth connections. The app loads fast even on 2G." },
      { q: "Can I use it in a rural area?", a: "Yes. That's exactly why we built offline mode. Rural mines, shops, and yards use Corelith daily." },
      { q: "What happens to my data when I'm offline?", a: "It's stored securely on your device. When you reconnect, it uploads automatically. Nothing is lost." },
    ],
  },
  {
    title: "Security & Data",
    questions: [
      { q: "Is my data safe?", a: "Yes. All data is encrypted in transit and at rest. We use the same security standards as international banks." },
      { q: "Can other businesses see my data?", a: "No. Your data is completely isolated from other businesses. We enforce hard tenant separation on every record." },
      { q: "Who can access my data?", a: "Only users you invite. You control who sees what with role-based permissions." },
      { q: "Is my data backed up?", a: "Yes. Daily backups to multiple locations. Your data is safe even if our primary servers fail." },
      { q: "Do you sell my data?", a: "No. Never. Your data is yours. We don't use it for ads. We don't share it with third parties." },
    ],
  },
  {
    title: "Features & Usage",
    questions: [
      { q: "What modules are available?", a: "Operations, Stores & Inventory, Retail & POS, Gold, Scrap & Recycling, Schools, Auto Sales, HR & Payroll, Maintenance, Compliance, CCTV, and more." },
      { q: "Can I use multiple modules?", a: "Yes. Growth plans include 3 modules. Business plans include all modules. You can add modules as add-ons too." },
      { q: "Does it work for my specific business?", a: "If your business deals with stock, sales, people, or money across one or more locations, Corelith fits. Check our solutions page for your industry." },
      { q: "Can I customize it?", a: "Business plans include custom document templates and branding. For deeper customization, contact us." },
      { q: "Does it integrate with accounting software?", a: "Corelith has built-in accounting modules. We also support ZIMRA fiscalisation and bank reconciliation." },
    ],
  },
  {
    title: "Support",
    questions: [
      { q: "How do I get help?", a: "WhatsApp us: +263 78 493 9111. Email: hello@pagka.dev. Business plans include phone support." },
      { q: "How fast do you reply?", a: "Within 2 hours during business hours (Mon-Fri, 8am-5pm CAT). Often faster." },
      { q: "Do you offer training?", a: "We include setup guidance with every trial. For larger teams, we offer remote training sessions." },
      { q: "What if I find a bug?", a: "Report it via WhatsApp or email. We fix critical bugs within 24 hours." },
    ],
  },
];

export default function FAQPage() {
  return (
    <MarketingSubpageShell
      eyebrow="FAQ"
      title="Questions? We&apos;ve got answers."
      description="If you don't see your question here, WhatsApp us. We reply within 2 hours."
      pills={["14-day trial", "No credit card", "Cancel anytime"]}
      panelTitle="Quick answers"
      panelBody="Most questions are answered here. For anything else, reach out on WhatsApp or email."
      panelLinks={[
        { label: "Contact us", href: "/home/contact" },
        { label: "Book a demo", href: "/home/book-demo" },
      ]}
    >
      <div className="space-y-16">
        {faqCategories.map((category) => (
          <section key={category.title}>
            <Reveal>
              <h2 className="mb-6 text-2xl font-semibold tracking-[-0.03em] text-[#0b1945]">{category.title}</h2>
            </Reveal>
            <div className="grid gap-4">
              {category.questions.map((faq, faqIndex) => (
                <Reveal key={faq.q} delay={0.05 * (faqIndex + 1)}>
                  <details className={`${styles.pricingHintBox} group cursor-pointer`}>
                    <summary className="flex items-center justify-between text-base font-semibold text-[#0b1945]">
                      {faq.q}
                      <span className="ml-4 text-[#7383a9] transition-transform group-open:rotate-180">
                        <ChevronDown className="size-4" />
                      </span>
                    </summary>
                    <p className="mt-3 text-sm leading-7 text-[#31436f]/84">{faq.a}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className={`mt-18 ${styles.ctaWrap} px-6 py-10 text-white lg:px-10`}>
        <div className="grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-end">
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/62">Still have questions?</p>
            <h3 className="max-w-2xl text-[clamp(2rem,3.7vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-balance">
              We&apos;re one message away.
            </h3>
            <p className="max-w-2xl text-sm leading-7 text-white/74">
              WhatsApp us: +263 78 493 9111<br />
              Email us: hello@pagka.dev<br />
              Or start a free trial and see for yourself.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button asChild size="lg" className="rounded-full bg-white text-[#091127] hover:bg-white/92 hover:text-[#091127]">
              <Link href="/home/book-demo">
                Start free trial
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-full border-white/18 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/home/contact">Contact us</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingSubpageShell>
  );
}
