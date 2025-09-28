export interface AccountView {
  user_id: string;
  username: string;
  email: string;
}
export interface AccountContextType {
  accountView: AccountView | null;
  setAccount: (newValue: AccountView | null) => void;
  justLogin: boolean;
  setJustLogin: (b: boolean) => void;
}
export interface AuthModalContextType {
  isOpen: boolean;
  openAuthModal: (type: "login" | "signup") => void;
  closeAuthModal: () => void;
  authType: "login" | "signup";
}
export interface ZoomContextType {
  zoomLevels: Record<string, number>;
  setZoomLevel: (scoreId: string, scale: number) => void;
  getZoomLevel: (scoreId: string) => number;
}
