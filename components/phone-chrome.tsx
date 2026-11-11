"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MoreHorizontalIcon, XIcon } from "lucide-react";
import { SidebarToggle } from "@/components/sidebar";
import { usePhoneLayout } from "@/components/phone-layout";

const PhoneChromeContext = createContext<{
  menuHost: HTMLDivElement | null;
  setMenuHost: (node: HTMLDivElement | null) => void;
  dictationHost: HTMLDivElement | null;
  setDictationHost: (node: HTMLDivElement | null) => void;
}>({ menuHost: null, setMenuHost: () => {}, dictationHost: null, setDictationHost: () => {} });

export function PhoneChromeProvider({ children }: { children: ReactNode }) {
  const [menuHost, setMenuHost] = useState<HTMLDivElement | null>(null);
  const [dictationHost, setDictationHost] = useState<HTMLDivElement | null>(null);
  return <PhoneChromeContext.Provider value={{ menuHost, setMenuHost, dictationHost, setDictationHost }}>{children}</PhoneChromeContext.Provider>;
}
export const usePhoneChrome = () => useContext(PhoneChromeContext);

export function PhoneHeader({ title, children }: { title: string; children?: ReactNode }) {
  const phone = usePhoneLayout();
  const { setMenuHost } = usePhoneChrome();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); } };
    document.addEventListener("keydown", close, true);
    return () => document.removeEventListener("keydown", close, true);
  }, [open]);
  if (!phone) return null;
  return <>
    <header className="lh-phone-header" data-testid="phone-header">
      <SidebarToggle />
      <span className="min-w-0 flex-1 truncate text-base font-semibold">{title}</span>
      <button type="button" aria-label="Lesson options" aria-expanded={open} onClick={() => setOpen(v => !v)} className="lh-phone-icon"><MoreHorizontalIcon /></button>
    </header>
    {open && <button className="lh-phone-options-backdrop" type="button" aria-label="Close lesson options" onClick={() => setOpen(false)} />}
    <section className="lh-phone-options" hidden={!open} aria-label="Lesson options">
      <div className="flex items-center justify-between"><span className="font-semibold">Lesson options</span><button type="button" className="lh-phone-icon" aria-label="Close options" onClick={() => setOpen(false)}><XIcon /></button></div>
      {children}
      <div ref={setMenuHost} />
    </section>
  </>;
}

export function PhoneDictationSlot() {
  const phone = usePhoneLayout();
  const { setDictationHost } = usePhoneChrome();
  return phone ? <div className="lh-phone-dictation" ref={setDictationHost} /> : null;
}
