import type { IconType } from "react-icons";
import { PiArrowsLeftRightFill, PiArrowsLeftRight, PiBarcodeFill, PiBarcode, PiBellFill, PiBell, PiCalculatorFill, PiCalculator, PiChartBarFill, PiChartBar, PiClipboardTextFill, PiClipboardText, PiDeviceMobileFill, PiDeviceMobile, PiFactoryFill, PiFactory, PiGearSixFill, PiGearSix, PiHandHeartFill, PiHandHeart, PiHandshakeFill, PiHandshake, PiHouseFill, PiHouse, PiMagnifyingGlassFill, PiMagnifyingGlass, PiMapPinFill, PiMapPin, PiMoneyFill, PiMoney, PiPackageFill, PiPackage, PiReceiptFill, PiReceipt, PiShieldCheckFill, PiShieldCheck, PiShoppingBagOpenFill, PiShoppingBagOpen, PiShoppingCartFill, PiShoppingCart, PiStorefrontFill, PiStorefront, PiTagFill, PiTag, PiTrashFill, PiTrash, PiTruckFill, PiTruck, PiUsersThreeFill, PiUsersThree, PiWarehouseFill, PiWarehouse, PiChatsCircleFill, PiChatsCircle, PiCalendarFill, PiCalendar, PiClockFill, PiClock, PiStarFill, PiStar, PiFileTextFill, PiFileText, PiWalletFill, PiWallet, PiPhoneFill, PiPhone, PiUploadSimpleFill, PiUploadSimple, PiWarningFill, PiWarning, PiMapTrifoldFill, PiMapTrifold, PiEnvelopeFill, PiEnvelope, PiScrollFill, PiScroll, PiFingerprintFill, PiFingerprint, PiKeyFill, PiKey, PiCalendarCheckFill, PiCalendarCheck } from "react-icons/pi";

/** أيقونات Phosphor: Fill جوه المربعات الملونة، Regular في القائمة الجانبية */
const I: Record<string, [IconType, IconType]> = {
  home: [PiHouseFill, PiHouse],
  sales: [PiShoppingCartFill, PiShoppingCart],
  purchase: [PiShoppingBagOpenFill, PiShoppingBagOpen],
  stock: [PiWarehouseFill, PiWarehouse],
  factory: [PiFactoryFill, PiFactory],
  truck: [PiTruckFill, PiTruck],
  accounts: [PiCalculatorFill, PiCalculator],
  hr: [PiUsersThreeFill, PiUsersThree],
  reports: [PiChartBarFill, PiChartBar],
  settings: [PiGearSixFill, PiGearSix],
  items: [PiTagFill, PiTag],
  pin: [PiMapPinFill, PiMapPin],
  shield: [PiShieldCheckFill, PiShieldCheck],
  pos: [PiBarcodeFill, PiBarcode],
  app: [PiDeviceMobileFill, PiDeviceMobile],
  store: [PiStorefrontFill, PiStorefront],
  heart: [PiHandHeartFill, PiHandHeart],
  trash: [PiTrashFill, PiTrash],
  transfer: [PiArrowsLeftRightFill, PiArrowsLeftRight],
  count: [PiClipboardTextFill, PiClipboardText],
  box: [PiPackageFill, PiPackage],
  orders: [PiReceiptFill, PiReceipt],
  tag: [PiMoneyFill, PiMoney],
  partner: [PiHandshakeFill, PiHandshake],
  bell: [PiBellFill, PiBell],
  search: [PiMagnifyingGlassFill, PiMagnifyingGlass],
  chat: [PiChatsCircleFill, PiChatsCircle],
  calendar: [PiCalendarFill, PiCalendar],
  clock: [PiClockFill, PiClock],
  star: [PiStarFill, PiStar],
  file: [PiFileTextFill, PiFileText],
  wallet: [PiWalletFill, PiWallet],
  phone: [PiPhoneFill, PiPhone],
  upload: [PiUploadSimpleFill, PiUploadSimple],
  warning: [PiWarningFill, PiWarning],
  map: [PiMapTrifoldFill, PiMapTrifold],
  mail: [PiEnvelopeFill, PiEnvelope],
  scroll: [PiScrollFill, PiScroll],
  finger: [PiFingerprintFill, PiFingerprint],
  key: [PiKeyFill, PiKey],
  shifts: [PiCalendarCheckFill, PiCalendarCheck],
};

export default function Icon({ name, size = 24, fill = true }: { name: string; size?: number; fill?: boolean }) {
  const [F, R] = I[name] ?? I.box;
  const C = fill ? F : R;
  return <C size={size} aria-hidden />;
}
