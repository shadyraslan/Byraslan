"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { activeLink, type NavGroup } from "@/lib/nav";

/** سايد بار على اليمين: الكمبيوتر ثابت، الموبايل بيتفتح من زرار ☰. اسم القسم بيفتح صفحته الرئيسية، والقسم اللي انت فيه مفتوح. */
export default function SideNav({ groups, name, signOut }: { groups: NavGroup[]; name: string; signOut: () => Promise<void> }) {
  const path = usePathname();
  const cur = activeLink(path, groups);
  const [open, setOpen] = useState(false);
  const [exp, setExp] = useState<string | null>(cur?.g.id ?? null);
  const [q, setQ] = useState("");
  useEffect(() => { setOpen(false); setExp(activeLink(path, groups)?.g.id ?? null); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  const norm = (s: string) => s.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
  const hits = q.trim() ? groups.flatMap((g) => g.links.filter((l) => norm(l.label + " " + g.title).includes(norm(q.trim())))) : null;
  const title = cur ? (cur.l ? cur.l.label : cur.g.title) : path === "/dashboard" ? "الرئيسية" : "باي رسلان";
  const icon = cur ? (cur.l ? cur.l.icon : cur.g.icon) : "home";

  return (
    <>
      <header className="mbar noprint">
        <button className="mbtn" aria-label="القايمة" onClick={() => setOpen(true)}>☰</button>
        <div className="mtitle"><Icon name={icon} size={18} fill={false} /> {title}</div>
        {cur && <Link href={`/sec/${cur.g.id}`} className="mbtn" aria-label={cur.g.title}><Icon name={cur.g.icon} size={20} fill={false} /></Link>}
        <Link href="/dashboard" className="mbtn" aria-label="الرئيسية"><Icon name="home" size={20} fill={false} /></Link>
      </header>
      {open && <div className="scrim noprint" onClick={() => setOpen(false)} />}
      <nav className={`side noprint${open ? " open" : ""}`}>
        <div className="brand"><img src="/logo.png" alt="By Raslan" /><button className="mclose" onClick={() => setOpen(false)} aria-label="اقفل">✕</button></div>
        <input className="nsearch" value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر على شاشة…" />
        <Link href="/dashboard" className={path === "/dashboard" ? "on" : ""}><Icon name="home" size={18} fill={false} /> الرئيسية</Link>
        {hits ? (
          <>
            {hits.map((l) => <Link key={l.href} href={l.href} onClick={() => setQ("")}><Icon name={l.icon} size={18} fill={false} /> {l.label}</Link>)}
            {!hits.length && <div className="grp">مفيش شاشة بالاسم ده</div>}
          </>
        ) : groups.map((g) => {
          const isOpen = exp === g.id;
          return (
            <div key={g.id} className="ngrp">
              <div className={`ghead${cur?.g.id === g.id ? " cur" : ""}`}>
                <Link href={`/sec/${g.id}`} className={`gl${path === `/sec/${g.id}` ? " on" : ""}`} onClick={() => setExp(g.id)}><Icon name={g.icon} size={18} fill={false} /> {g.title}</Link>
                <button className="chev" aria-label="افتح" onClick={() => setExp(isOpen ? null : g.id)}>{isOpen ? "−" : "+"}</button>
              </div>
              {isOpen && g.links.map((l) => <Link key={l.href} href={l.href} className={cur?.l?.href === l.href ? "on sub" : "sub"}><Icon name={l.icon} size={17} fill={false} /> {l.label}</Link>)}
            </div>
          );
        })}
        <div style={{ flex: 1, minHeight: 12 }} />
        <form action={signOut}><button className="btn" style={{ width: "100%" }}>خروج — {name}</button></form>
      </nav>
    </>
  );
}
