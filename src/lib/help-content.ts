export type HelpTopic = {
  slug: string;
  title: string;
  summary: string;
  icon: "battery" | "truck" | "shield" | "boxes";
  readMinutes: number;
  sections: Array<{ heading: string; paragraphs: string[]; bullets?: string[] }>;
};

export const HELP_TOPICS: HelpTopic[] = [
  {
    slug: "battery-safety",
    title: "Battery safety",
    summary: "Charging, storage, transport, pack building and what to do with a damaged cell.",
    icon: "battery",
    readMinutes: 6,
    sections: [
      {
        heading: "Before you connect anything",
        paragraphs: [
          "Lithium cells store enough energy to start a fire when shorted, crushed, overcharged or wired with the wrong protection. Work on a clear, non-flammable surface and keep metal tools, jewellery and loose wire away from exposed terminals.",
          "Check every cell for dents, torn insulation, corrosion, leakage or unusual heat. Do not charge or weld a suspect cell. Our bench can test it and tell you whether it should be recycled.",
        ],
        bullets: [
          "Use a charger designed for the exact chemistry and series count.",
          "Match the BMS to both cell chemistry and pack voltage before connecting it.",
          "Never mix old and new cells, different capacities or different chemistries in one pack.",
          "Insulate series connections and exposed nickel before closing the pack.",
        ],
      },
      {
        heading: "Charging and everyday use",
        paragraphs: [
          "A 3.6V lithium-ion cell normally charges to 4.2V; LiFePO4 normally charges to 3.65V. Multiply that limit by the series count to find the pack ceiling. A 12V lead-acid charger is not automatically safe for a lithium pack.",
          "Charge where you can see the pack, away from bedding, paper and direct sun. Stop using it if it swells, smells unusual, becomes too hot to touch, or the BMS repeatedly disconnects.",
        ],
      },
      {
        heading: "Storage, transport and damaged cells",
        paragraphs: [
          "For storage longer than a few weeks, leave cells at roughly 40–60% charge in a cool, dry place. Check them every few months. Terminals should be covered and packs should not rattle against each other.",
          "Do not put a swollen or punctured cell in household waste, water, a fire or an ordinary courier parcel. Move it only if you can do so without touching damaged material, keep people away, and contact us for safe disposal guidance. If a pack is smoking or flaming, evacuate and call the fire service rather than trying to carry it.",
        ],
      },
    ],
  },
  {
    slug: "shipping",
    title: "Courier & shipping",
    summary: "Dhaka and nationwide rates, dispatch cut-offs, tracking and delivery problems.",
    icon: "truck",
    readMinutes: 4,
    sections: [
      {
        heading: "Rates and timing",
        paragraphs: [
          "Standard delivery is ৳80 inside Dhaka and ৳130 outside Dhaka, unless your current checkout settings show a shop-specific rate. Standard delivery becomes free when the order reaches the free-delivery threshold shown in the cart.",
          "In-stock orders are normally prepared within 24 hours. Standard parcels take about 1–2 working days inside Dhaka and 2–4 working days elsewhere. Custom packs need assembly and testing, so allow 3–5 working days before dispatch.",
        ],
        bullets: [
          "Express same-day is available for eligible Dhaka addresses ordered before the daily cut-off.",
          "Fridays, public holidays, severe weather and courier disruptions can add time.",
          "Remote or unsafe locations may require collection from the nearest courier point.",
        ],
      },
      {
        heading: "Tracking and receiving a parcel",
        paragraphs: [
          "Open Track order and enter the order number and the mobile number used at checkout. Status updates appear when the bench confirms, packs, ships and delivers the order. Courier tracking may lag behind our bench status by a few hours.",
          "Check the outer box before accepting it. If it is crushed, wet or open, photograph it and tell the rider. Do not accept a lithium battery parcel that is hot, leaking or smoking.",
        ],
      },
      {
        heading: "Wrong address or failed delivery",
        paragraphs: [
          "Message us as soon as you notice an address error. We can usually change it before the courier collects the parcel; once it is in the courier network, changes are not guaranteed. Repeated unanswered calls or an incomplete address can return the parcel to the shop and may require another delivery charge.",
        ],
      },
    ],
  },
  {
    slug: "warranty-returns",
    title: "Warranty & returns",
    summary: "What is covered, how testing works, and how to start a return or warranty claim.",
    icon: "shield",
    readMinutes: 5,
    sections: [
      {
        heading: "Start with the order number",
        paragraphs: [
          "Contact support with your order number, mobile number and a short description of the fault. Photos of the product, packaging and wiring help us diagnose the problem without unnecessary courier trips.",
          "Unopened cells, modules and tools can normally be returned within 14 days of delivery. Items must be unused and in their original condition. Contact us before shipping anything back; lithium batteries need appropriate packaging and courier approval.",
        ],
      },
      {
        heading: "What the workshop warranty covers",
        paragraphs: [
          "The warranty duration is shown on each product page. It covers manufacturing faults and, for our assembled packs, defects in our welding and assembly. We test the returned item and repair or replace an eligible fault.",
        ],
        bullets: [
          "Normal capacity ageing and consumable wear are not manufacturing faults.",
          "Water, crushing, reverse polarity, short circuits, overcharging and unauthorised modification are excluded.",
          "A removed BMS, cut seal, soldered repair or incorrect charger can void coverage.",
          "Custom-built packs are made to order and are returnable only when faulty, not because a specification was chosen incorrectly.",
        ],
      },
      {
        heading: "Refund timing",
        paragraphs: [
          "Once a return is inspected and approved, refunds are sent to the original payment method where possible. Mobile-wallet and card settlements usually take 3–5 working days after approval. Cash-on-delivery refunds are arranged through a verified mobile wallet or bank account after confirming the customer identity.",
        ],
      },
    ],
  },
  {
    slug: "wholesale",
    title: "Wholesale & volume builds",
    summary: "Matched batches, reseller pricing, school/lab orders and recurring pack production.",
    icon: "boxes",
    readMinutes: 4,
    sections: [
      {
        heading: "What we can supply",
        paragraphs: [
          "We support repair shops, robotics teams, solar installers and product builders who need repeatable parts rather than one-off retail quantities. Available work includes capacity-matched cell batches, recurring BMS orders, custom battery packs and workshop consumables.",
          "Tell us the cell model, monthly quantity, target application, discharge current and delivery district. For a pack, include series/parallel configuration, enclosure limits and connector requirements.",
        ],
      },
      {
        heading: "Quotation and testing",
        paragraphs: [
          "Volume pricing depends on the current cell batch, quantity and testing requirements. A written quotation states the exact model, capacity tolerance, BMS, warranty, lead time and delivery terms. Prices are not promised until stock and specification are confirmed.",
          "For production packs we normally approve a sample first. Batch orders can include capacity/internal-resistance screening, balance reports and labelled groups. These checks add time but reduce failures in the finished product.",
        ],
      },
      {
        heading: "Payment and paperwork",
        paragraphs: [
          "Large or recurring orders may require an advance and are not necessarily eligible for cash on delivery. Ask for a business invoice with your registered organisation details and any tax documentation you need. Trade-licence and BIN details shown on the shop's policy pages should be verified before relying on them for accounting.",
        ],
      },
    ],
  },
];

export function findHelpTopic(slug: string): HelpTopic | undefined {
  return HELP_TOPICS.find((topic) => topic.slug === slug);
}

export function searchHelp(query: string): HelpTopic[] {
  const term = query.trim().toLowerCase();
  if (!term) return HELP_TOPICS;
  return HELP_TOPICS.filter((topic) =>
    `${topic.title} ${topic.summary} ${topic.sections.map((section) => `${section.heading} ${section.paragraphs.join(" ")} ${(section.bullets ?? []).join(" ")}`).join(" ")}`
      .toLowerCase()
      .includes(term),
  );
}
