import type { IconType } from "react-icons";
import { PiArrowsLeftRightFill, PiArrowsLeftRight, PiBarcodeFill, PiBarcode, PiBellFill, PiBell, PiCalculatorFill, PiCalculator, PiChartBarFill, PiChartBar, PiClipboardTextFill, PiClipboardText, PiDeviceMobileFill, PiDeviceMobile, PiFactoryFill, PiFactory, PiGearSixFill, PiGearSix, PiHandHeartFill, PiHandHeart, PiHandshakeFill, PiHandshake, PiHouseFill, PiHouse, PiMagnifyingGlassFill, PiMagnifyingGlass, PiMapPinFill, PiMapPin, PiMoneyFill, PiMoney, PiPackageFill, PiPackage, PiReceiptFill, PiReceipt, PiShieldCheckFill, PiShieldCheck, PiShoppingBagOpenFill, PiShoppingBagOpen, PiShoppingCartFill, PiShoppingCart, PiStorefrontFill, PiStorefront, PiTagFill, PiTag, PiTrashFill, PiTrash, PiTruckFill, PiTruck, PiUsersThreeFill, PiUsersThree, PiWarehouseFill, PiWarehouse } from "react-icons/pi";

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
};

export default function Icon({ name, size = 24, fill = true }: { name: string; size?: number; fill?: boolean }) {
  const [F, R] = I[name] ?? I.box;
  const C = fill ? F : R;
  return <C size={size} aria-hidden />;
}
