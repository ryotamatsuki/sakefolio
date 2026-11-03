export interface Brand {
  brandId: string;
  brandName: string;
  breweryName: string;
  prefecture: string;
  breweryId?: string;
  municipality?: string;
  breweryAddress?: string;
  addressSource?: 'SAKEOpenData';
}
export interface RecordEntry {
  reviewId: string;
  brandId: string;
  brandName: string;
  breweryName: string;
  prefecture: string;
  municipality: string;
  breweryAddress: string;
  productName: string;
  sakeType: string;
  sakeTypeOther: string;
  brewingMethod: string;
  heatTreatment: string;
  processingStyles: string;
  riceVariety: string;
  polishingRatio: string;
  alcoholPercent: string;
  vintage: string;
  drinkingDate: string;
  rating: string;
  aromaTagIds: string;
  tasteTagIds: string;
  sweetDry: string;
  lightRich: string;
  acidity: string;
  umami: string;
  notes: string;
  photoId: string;
  createdAt: string;
}
export interface StorageInfo { folderId: string; spreadsheetId: string; photoFolderId: string }
export interface TokenResponse { access_token?: string; error?: string; error_description?: string }
export interface RevocationResponse {
  successful: boolean;
  error?: string;
  error_description?: string;
  requestId?: string;
  eventId?: string;
  requestedAt?: string;
  completedAt?: string;
  durationMs?: number;
  source?: 'callback' | 'timeout' | 'unavailable' | 'exception';
}
declare global {
  interface Window {
    google?: { accounts: { oauth2: {
      initTokenClient: (options: { client_id: string; scope: string; include_granted_scopes?: boolean; callback: (response: TokenResponse) => void; error_callback?: (error: unknown) => void; }) => { requestAccessToken: (options?: { prompt?: string }) => void };
      revoke: (token: string, callback: (response: RevocationResponse) => void) => void;
    } } };
  }
}
