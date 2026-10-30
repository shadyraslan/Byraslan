import Link from "next/link";
import Icon from "./Icon";

export default function Tile({ href, icon, color, label, sub, soon }: { href: string; icon: string; color: string; label: string; sub?: string; soon?: boolean }) {
  return (
    <Link href={href} className={"tile" + (soon ? " soon" : "")} style={{ ["--c" as string]: color }}>
      <span className="ico"><Icon name={icon} size={30} /></span>
      <b>{label}</b>
      {sub && <small>{sub}</small>}
      {soon && <em>قريبًا</em>}
    </Link>
  );
}
