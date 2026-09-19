export type SellSpeed = "quick" | "normal" | "max";

export interface IdentifiedItem {
  name: string;
  brand: string;
  model: string;
  category: string;
  subcategory?: string;
  confidence: number;
  visibleCondition?: string;
  notes?: string;
  /** Fields the model is confident enough to treat as known (skip asking). */
  knownFields?: string[];
  /** Fields that still need user confirmation or input. */
  uncertainFields?: string[];
  /** Short summary shown to the user after photo ID. */
  summary?: string;
}

export interface AgentQuestion {
  field:
    | "brand"
    | "model"
    | "category"
    | "purchased"
    | "condition"
    | "functional"
    | "damage"
    | "accessories"
    | "dimensions"
    | "sellSpeed";
  text: string;
  hint?: string;
  placeholder: string;
  inputType?: "choice" | "text" | "both";
  choices?: { label: string; value: string }[];
}

export interface ComparableListing {
  title: string;
  price: number;
  condition: string;
  platform: string;
  location?: string;
  url?: string;
  source: "live" | "curated" | "ai_estimate";
}

/** Values inferred from the photo to prefill the item before asking. */
export interface IdentifyPrefill {
  brand?: string;
  model?: string;
  category?: string;
  condition?: string;
  damage?: string;
  accessories?: string;
  dimensions?: string;
}
