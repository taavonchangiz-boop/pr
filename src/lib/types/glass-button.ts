// Shared types — destination-scoped Glass buttons.
export interface GlassButton {
  id: string;
  label: string;
  url?: string | null;
  callbackData?: string | null;
  rowOrder: number;
  enabled: boolean;
}
