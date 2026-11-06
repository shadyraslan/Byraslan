"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { activeLink, type NavGroup } from "@/lib/nav";

/** سايد بار على اليمين: الكمبيوتر ثابت، الموبايل بيتفتح من زرار ☰. القسم اللي انت فيه مفتوح، والباقي مقفول. */
export default function SideNav({ groups, name, signOut }: { groups: NavGroup[]; name: string; signOut: () => Promise<void> }) {
  const path = usePathname();
  const cur = activeLink(path, groups);
  const [open, setOpen] = useState(false);
  const [exp, setExp] = useState<string | null>(cur?.g.title ?? null);
  const [q, setQ] = useState("");
  useEffect(() => { setOpen(false); setExp(activeLink(path, groups)?.g.title ?? null); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  const norm = (s: string) => s.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
  const hits = q.trim() ? groups.flatMap((g) => g.links.filter((l) => norm(l.label + " " + g.title).includes(norm(q.trim())))) : null;

  return (
    <>
      {/* الموبايل: شريط صغير فيه زرار القايمة واسم الصفحة بس */}
      <header className="mbar noprint">
        <button className="mbtn" aria-label="القايمة" onClick={() => setOpen(true)}>☰</button>
        <div className="mtitle">{cur ? `${cur.l.icon} ${cur.l.label}` : path === "/dashboard" ? "🏠 الرئيسية" : "باي رسلان"}</div>
        <Link href="/dashboard" className="mbtn" aria-label="الرئيسية">🏠</Link>
      </header>
      {open && <div className="scrim noprint" onClick={() => setOpen(false)} />}
      <nav className={`side noprint${open ? " open" : ""}`}>
        <div className="brand"><img src="/logo.png" alt="By Raslan" /><button className="mclose" onClick={() => setOpen(false)} aria-label="اقفل">✕</button></div>
        <input className="nsearch" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 دوّر على شاشة…" />
        <Link href="/dashboard" className={path === "/dashboard" ? "on" : ""}>🏠 الرئيسية</Link>
        {hits ? (
          <>
            {hits.map((l) => <Link key={l.href} href={l.href} className={cur?.l.href === l.href ? "on" : ""} onClick={() => setQ("")}>{l.icon} {l.label}</Link>)}
            {!hits.length && <div className="grp">مفيش شاشة بالاسم ده</div>}
          </>
        ) : groups.map((g) => {
          const isOpen = exp === g.title;
          return (
            <div key={g.title} className="ngrp">
              <button className={`ghead${cur?.g.title === g.title ? " cur" : ""}`} onClick={() => setExp(isOpen ? null : g.title)}>
                <span>{g.icon} {g.title}</span><span className="chev">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && g.links.map((l) => <Link key={l.href} href={l.href} className={cur?.l.href === l.href ? "on" : ""}>{l.icon} {l.label}</Link>)}
            </div>
          );
        })}
        <div style={{ flex: 1, minHeight: 12 }} />
        <form action={signOut}><button className="btn" style={{ width: "100%" }}>خروج — {name}</button></form>
      </nav>
    </>
  );
}
