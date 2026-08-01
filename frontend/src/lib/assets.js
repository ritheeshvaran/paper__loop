/** Paper & Loop brand assets — bundled in public/uploads/ for Vercel static hosting. */
export const BRAND_ASSETS = {
  hero: "/uploads/hero-background.png",
  logo: "/uploads/logo-paper-loop.png",
  authLogin: "/uploads/auth-login.jpg",
  authRegister: "/uploads/auth-register.jpg",
  authForgot: "/uploads/auth-forgot.jpg",
  authAbout: "/uploads/auth-about.jpg",
  roomBedroom: "/uploads/room-bedroom.jpg",
  roomGaming: "/uploads/room-gaming.jpg",
  roomLiving: "/uploads/room-living.jpg",
  comingSoonTees: "/uploads/coming-soon-tees.jpg",
  comingSoonHoodies: "/uploads/coming-soon-hoodies.jpg",
  comingSoonAccessories: "/uploads/coming-soon-accessories.jpeg",
};

export const brandAsset = (key) => BRAND_ASSETS[key] || "";

export const ROOM_TEMPLATES = [
  { name: "Bedroom", asset: "roomBedroom", zone: { top: "22%", left: "38%", width: "24%", height: "34%" } },
  { name: "Gaming setup", asset: "roomGaming", zone: { top: "18%", left: "36%", width: "28%", height: "38%" } },
  { name: "Living room", asset: "roomLiving", zone: { top: "20%", left: "40%", width: "22%", height: "32%" } },
];
