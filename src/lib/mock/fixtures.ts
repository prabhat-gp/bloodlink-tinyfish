import type { RawBank } from "../types";

/**
 * MOCK DATA — shaped from a real eRaktKosh snapshot (Bangalore Urban, Whole Blood, 31 Oct 2026).
 * Bank names, the availability text formats and the 10/94 split are real. Which bank holds which
 * units is NOT real (shuffled for the demo). Phones are only included where the site published
 * them for that bank. Never present mock results as live stock.
 */
export const SNAPSHOT_NOTE = "Mock data shaped from a 31 Oct 2026 eRaktKosh snapshot. Not live stock.";

export const BANGALORE_URBAN_WHOLE_BLOOD: RawBank[] = [
  {
    bank_name: "Fortis Hospital Pvt. Ltd.",
    address: "154/9, Bannerghatta Road, Opposite IIM-B, Bengaluru, Bangalore Urban, Karnataka",
    phone: "8123242142",
    email: "blood.bank1@fortishealthcare,com",
    category: "Private",
    availability_text: "Whole BloodNot Available Search for another Component",
    last_updated: "2026-10-31 00:29:06",
  },
  {
    bank_name: "Manipal Hospital Yeshwanthpur Blood Centre",
    address: "24/1, Brigade Gateway, Beside Metro, Malleswaram West, Yeshwanthpur, Bangalore Urban, Karnataka",
    phone: "9535871458",
    email: "bloodbank.mhypr@manipalhospitals.com",
    category: "Private",
    availability_text: "Available, O+Ve:18, AB+Ve:3, A+Ve:3, B-Ve:1, O-Ve:1, B+Ve:2",
    last_updated: "2026-10-31 00:18:04",
  },
  {
    bank_name: "Aster Hospital Whitefield Blood Centre",
    address: "Plot No 2,3 & 4, 2nd Floor, off ITPL Main Road, Whitefield, Bengaluru, Bangalore Urban, Karnataka",
    phone: "8951386527",
    email: "bloodcenter.whitefield@asterhospital.com",
    category: "Private",
    availability_text: "Whole BloodNot Available Search for another Component",
    last_updated: "2026-10-31 00:17:36",
  },
  {
    bank_name: "PES University Institute of Medical Sciences and Research Blood Centre",
    address: "Sy. No. 37, 38, 2nd Floor, General Hospital Building, PES University, Bangalore Urban, Karnataka",
    phone: "7411814902",
    email: "bloodcenter@pesuimsr.pes.edu",
    category: "Private",
    availability_text: "Available, O+Ve:1",
    last_updated: "2026-10-31 00:05:20",
  },
  {
    bank_name: "Sparsh Hospital Blood Centre",
    address: "Ground Floor, No. 8, Ideal Homes, HBCS Layout, Rajarajeshwari Nagar, Bangalore Urban, Karnataka",
    category: "Private",
    availability_text: "Whole BloodNot Available Search for another Component",
    last_updated: "2026-10-31 00:00:17",
  },
  {
    bank_name: "Gleneagles BGS Hospitals Blood Centre",
    address: "Bangalore Urban, Karnataka",
    category: "Private",
    availability_text: "Available, A-Ve:1, B-Ve:5, O-Ve:6, B+Ve:35, AB+Ve:4, A+Ve:19, O+Ve:53, AB-Ve:1",
    last_updated: "2026-10-30 17:25:41",
  },
  {
    bank_name: "Indian Red Cross Society, Karnataka Red Cross Blood Centre",
    address: "Bangalore Urban, Karnataka",
    category: "Red Cross",
    availability_text: "Available, O +ve, B +ve, O -ve, A +ve, B -ve, AB +ve, A -ve",
    last_updated: "2026-10-30 17:11:46",
  },
  {
    bank_name: "Bowring and Lady Curzon Hospitals Blood Centre",
    address: "Shivajinagar, Bangalore Urban, Karnataka",
    category: "Govt.",
    availability_text: "Available, A+Ve:3, AB-Ve:1, O+Ve:23, A-Ve:2",
    last_updated: "2026-10-30 16:30:58",
  },
  {
    bank_name: "Sri Sathya Sai Institute of Higher Medical Sciences Blood Centre",
    address: "Whitefield, Bangalore Urban, Karnataka",
    category: "Private",
    availability_text: "Available, O-Ve:1",
    last_updated: "2026-10-30 16:20:12",
  },
  {
    bank_name: "Rotary Blood Centre",
    address: "No 166, 3rd Floor, 5th Main, Bangalore Urban, Karnataka",
    category: "Charitable/Vol",
    availability_text: "Available, B+Ve:2, B-Ve:1",
    last_updated: "2026-10-30 15:53:36",
  },
  {
    bank_name: "Sample Stale Blood Centre (mock)",
    address: "Bangalore Urban, Karnataka",
    category: "Charitable/Vol",
    availability_text: "Available, A+Ve:1, B+Ve:1, O+Ve:2, AB+Ve:1",
    last_updated: "2026-03-05 09:45:47.863",
  },
  {
    bank_name: "Sample Blood Centre, no stock (mock)",
    address: "Bangalore Urban, Karnataka",
    category: "Govt.",
    availability_text: "Whole BloodNot Available Search for another Component",
    last_updated: "2026-10-29 11:02:00",
  },
];

/** Deterministic mock rows for neighbouring districts / other components. */
export function mockNeighbourRows(districtName: string, componentName: string, seed: number): RawBank[] {
  const pattern = seed % 3;
  const base = {
    address: `${districtName}, Karnataka`,
    last_updated: seed % 2 ? "2026-10-31 08:10:00" : "2026-10-30 21:40:00",
  };
  if (pattern === 0) return [];
  if (pattern === 1)
    return [
      {
        ...base,
        bank_name: `District Hospital Blood Centre, ${districtName} (mock)`,
        category: "Govt.",
        availability_text: `${componentName}Not Available Search for another Component`,
      },
    ];
  return [
    {
      ...base,
      bank_name: `District Hospital Blood Centre, ${districtName} (mock)`,
      category: "Govt.",
      availability_text: "Available, O-Ve:2, O+Ve:7, B+Ve:4",
    },
    {
      ...base,
      bank_name: `Charitable Blood Centre, ${districtName} (mock)`,
      category: "Charitable/Vol",
      availability_text: "Available, O +ve, A +ve",
    },
  ];
}

export interface Camp {
  title: string;
  date: string;
  place: string;
  organiser: string;
  url?: string;
}

export const MOCK_CAMPS: Camp[] = [
  { title: "Voluntary blood donation camp (mock)", date: "2026-11-02", place: "Koramangala, Bengaluru", organiser: "Sample NGO" },
  { title: "Corporate donation drive (mock)", date: "2026-11-05", place: "Whitefield, Bengaluru", organiser: "Sample Tech Park" },
  { title: "College NSS camp (mock)", date: "2026-11-08", place: "Jayanagar, Bengaluru", organiser: "Sample College NSS" },
];

export interface Source {
  title: string;
  url: string;
  snippet?: string;
}

/** MOCK. Shape of what the free Search + Fetch enrichment returns. */
export const mockEnrich = (bankName: string) => ({
  phones: [] as string[],
  sources: [
    { title: `${bankName}: contact page (mock)`, url: "https://example.org/contact", snippet: "Blood centre open 24x7. Call before visiting." },
    { title: `${bankName} on Google Maps (mock)`, url: "https://example.org/maps", snippet: "Hospital · Bengaluru" },
  ] as Source[],
});

/** MOCK. Shape of the cached TinyFish Research (deep) answer about the Bombay blood group. */
export const MOCK_RESEARCH = {
  summary:
    "The Bombay (Oh) phenotype lacks the H antigen, so patients can only receive Oh blood. Ordinary O stock is incompatible. " +
    "The fastest route is a rare-donor registry or a Bombay-group donor network, plus asking large blood centres whether they hold frozen Oh units.",
  steps: [
    "Confirm the Oh phenotype with the hospital blood bank (anti-H test).",
    "Contact a rare-donor registry and Bombay-group donor networks.",
    "Ask large regional blood centres about frozen or reserved Oh units.",
    "Line up family members for testing: siblings are the most likely matches.",
  ],
  citations: [
    { title: "Sample citation (mock)", url: "https://example.org/bombay-blood-group" },
  ] as Source[],
};
