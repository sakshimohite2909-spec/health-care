import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { db, auth } from "@/firebase";
import { collection, query, where, onSnapshot, getDocs, doc, setDoc } from "firebase/firestore";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously } from "firebase/auth";
import { useAuth } from "@/hooks/use-auth";

import { motion, AnimatePresence } from "framer-motion";

function AnimatedWrapper({ children }: { children: React.ReactNode, index?: number }) {
  return (
    <div className="flex flex-col h-full [&>div]:flex-1 [&>div]:h-full">
      {children}
    </div>
  );
}
import { AppShell } from "@/components/AppShell";
import { RequireRole } from "@/components/RequireRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogHeader } from "@/components/ui/dialog";
import { calculateAge, statusColor, statusLabel, doctorName, CaseStatus, parseCaseNotes, extractCleanNotes } from "@/lib/case-utils";
import { generateCasePaperPDF, generatePDFFromElementId, shareCasePaperPDF } from "@/lib/pdf";
import { FileText, Download, Share2, Loader2, Plus, Stethoscope, Smartphone, ZoomIn, Calendar, Phone, MapPin, User, ClipboardList, Pill, ArrowLeft, CheckCircle2 } from "lucide-react";
import { VoiceButton } from "@/components/VoiceButton";
import { getNextPatientId, getNextCasePaperId, createPatientRecord } from "@/lib/patient-service";

export const Route = createFileRoute("/patient")({
  component: () => (
    <AppShell title="Patient" fullWidth><PatientPage /></AppShell>
  ),
});

const LOGO_SVG_STRING = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" font-family="sans-serif">
  <circle cx="50" cy="50" r="48" fill="#fbbd08" />
  <circle cx="50" cy="50" r="36" fill="black" />
  <circle cx="50" cy="50" r="34" fill="none" stroke="#fbbd08" stroke-width="1" />
  <path id="curve-top" d="M 8 50 A 42 42 0 1 1 92 50" fill="none" />
  <text fill="black" font-weight="bold" font-size="10.5px" letter-spacing="0.8">
    <textPath href="#curve-top" startOffset="50%" text-anchor="middle">MOOLATVAM AYURVED</textPath>
  </text>
  <path id="curve-bottom" d="M 92 50 A 42 42 0 0 1 8 50" fill="none" />
  <text fill="black" font-weight="bold" font-size="4.8px" letter-spacing="0.5">
    <textPath href="#curve-bottom" startOffset="50%" text-anchor="middle">स्वास्थ्यरक्षणार्थं...व्याधिमोक्षणार्थं...</textPath>
  </text>
  <path d="M 50 63 L 50 39 A 10 10 0 0 1 70 39 L 70 63 Z" fill="none" stroke="#fbbd08" stroke-width="2.5" />
  <path d="M 50 44 L 70 44" stroke="#fbbd08" stroke-width="2.5" />
  <path d="M 50 49 L 70 49" stroke="#fbbd08" stroke-width="2.5" />
  <path d="M 50 54 L 70 54" stroke="#fbbd08" stroke-width="2.5" />
  <path d="M 42 69 C 38 69 36 65 36 65" stroke="#fbbd08" stroke-width="2" fill="none" stroke-linecap="round" />
  <path d="M 42 67 C 26 67 26 47 30 43 C 38 47 42 59 42 67 Z" fill="#fbbd08" />
  <path d="M 42 67 C 34 63 30 43 30 43" stroke="black" stroke-width="1.2" fill="none" stroke-linecap="round" />
  <path d="M 42 67 C 30 51 42 35 46 35 C 50 47 46 63 42 67 Z" fill="#fbbd08" />
  <path d="M 42 67 C 40 55 46 35 46 35" stroke="black" stroke-width="1.2" fill="none" stroke-linecap="round" />
  <path d="M 42 67 C 58 71 70 59 70 51 C 62 47 50 59 42 67 Z" fill="#fbbd08" />
  <path d="M 42 67 C 54 65 70 51 70 51" stroke="black" stroke-width="1.2" fill="none" stroke-linecap="round" />
</svg>`;

export const LogoSVG = ({ idPrefix = "logo" }: { idPrefix?: string }) => {
  return <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG_STRING)}`} className="w-full h-full drop-shadow-lg" alt="Logo" />;
};

const schema = z.object({
  full_name: z.string().trim().min(2).max(100),
  address: z.string().trim().min(2).max(500),
  mobile: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, "Invalid mobile"),
  dob: z.string().min(1, "DOB required"),
  notes: z.string().max(2000).optional(),
  marital_status: z.string().optional(),
  education: z.string().optional(),
  occupation: z.string().optional(),
  parents_occupation: z.string().optional(),
  menstrual_history: z.string().optional(),
  past_history: z.string().optional(),
  weight: z.string().optional(),
  gender: z.string().optional(),
});

export function CasePaperContent({ c, showClinicalHistory = true }: { c: any; showClinicalHistory?: boolean }) {
  const formattedDob = c.dob ? new Date(c.dob).toLocaleDateString("en-IN") : "";
  const formattedCreated = c.created_at ? new Date(c.created_at).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN");

  return (
    <>
      {/* Top Header Background SVG */}
      <div className="absolute top-0 left-0 w-full h-[180px] z-0 pointer-events-none">
        <svg preserveAspectRatio="none" viewBox="0 0 1000 200" className="w-full h-full">
          <path d="M0,0 L1000,0 L1000,160 Q500,200 0,120 Z" fill="#fbbd08" />
        </svg>
      </div>

      {/* Top Header Content */}
      <div className="relative z-10 w-full px-12 pt-8 pb-4 flex justify-between items-start">
        {/* Left: Doctor 1 */}
        <div className="flex-1 mt-1">
          <div className="font-bold text-black text-[16px] tracking-wide">Dr. Kadambari Jagtap</div>
          <div className="text-[11px] text-black font-semibold mt-0.5 text-right w-[145px]">MD Ayu. Sch.</div>
        </div>

        {/* Center: Doctor 2 & Quote */}
        <div className="flex-1 flex flex-col items-center -mt-2">
          <div className="text-[14px] font-bold text-black mb-1">॥ श्रीः ॥</div>
          <div className="font-bold text-black text-[16px] tracking-wide">Dr. Omprasad Jagtap</div>
          <div className="text-[11px] text-black font-semibold mt-0.5 text-right w-[140px]">MD Ayu.</div>
          <div className="text-[12px] text-black font-bold mt-4 tracking-wider">स्वास्थ्यरक्षणार्थं...व्याधिमोक्षणार्थं...</div>
        </div>

        {/* Right: Logo */}
        <div className="flex-1 flex justify-end">
          <div className="relative flex items-center justify-center w-[120px] h-[120px] -mt-2">
            <LogoSVG idPrefix={`case-${c.id}`} />
          </div>
        </div>
      </div>

      {/* Form Content */}
      <div className="relative z-10 px-12 py-8 flex-1 flex flex-col text-[14px] font-medium leading-relaxed">
        {/* Name */}
        <div className="flex mb-6">
          <span className="font-bold mr-2 whitespace-nowrap">Name :</span>
          <span className="flex-1 font-semibold">{c.full_name}</span>
        </div>

        {/* Grid layout matching official format */}
        <div className="grid grid-cols-[1fr_1.2fr_0.8fr] gap-x-4 gap-y-6 w-full">
          {/* Row 1 */}
          <div className="flex">
            <span className="font-bold mr-2">Date Of Birth:</span>
            <span className="flex-1 font-semibold">{formattedDob}</span>
          </div>
          <div className="flex">
            <span className="font-bold mr-2">Age & Gender :</span>
            <span className="flex-1 font-semibold">{c.age} {c.gender ? `/ ${c.gender}` : ""}</span>
          </div>
          <div className="flex">
            <span className="font-bold mr-2">Date :</span>
            <span className="flex-1 font-semibold">{formattedCreated}</span>
          </div>

          {/* Row 2 */}
          <div className="flex">
            <span className="font-bold mr-2">Phone No. :</span>
            <span className="flex-1 font-semibold">{c.mobile}</span>
          </div>
          <div className="flex">
            <span className="font-bold mr-2">Married/Unmarried :</span>
            <span className="flex-1 font-semibold">{c.marital_status}</span>
          </div>
          <div className="flex">
            <span className="font-bold mr-2">Education :</span>
            <span className="flex-1 font-semibold">{c.education}</span>
          </div>

          {/* Row 3 & 4 (Address spanning 2 rows on left) */}
          <div className="col-span-2 row-span-2 flex items-start">
            <span className="font-bold mr-2 mt-0.5">Address :</span>
            <span className="flex-1 font-semibold pr-4 whitespace-pre-wrap leading-relaxed">{c.address}</span>
          </div>
          <div className="flex">
            <span className="font-bold mr-2">Occupation :</span>
            <span className="flex-1 font-semibold">{c.occupation}</span>
          </div>

          {/* Row 4 right side */}
          <div className="flex">
            <span className="font-bold mr-2">Parent's Occu. :</span>
            <span className="flex-1 font-semibold">{c.parents_occupation}</span>
          </div>
        </div>

        {/* History Section - 4 labels spread horizontally (Shown in Nurse/Doctor Dashboard, hidden for QR patient registration) */}
        {showClinicalHistory && (
          <>
            <div className="grid grid-cols-[1.5fr_1fr_1fr_0.8fr] gap-4 w-full mt-10 mb-2">
              <div className="flex">
                <span className="font-bold mr-2">History of present illness :</span>
              </div>
              <div className="flex">
                <span className="font-bold mr-2">पाळीचा इतिहास</span>
              </div>
              <div className="flex">
                <span className="font-bold mr-2">मागील इतिहास</span>
              </div>
              <div className="flex">
                <span className="font-bold mr-2">वजन :</span>
              </div>
            </div>

            {/* Actual data for History */}
            <div className="grid grid-cols-[1.5fr_1fr_1fr_0.8fr] gap-4 w-full mb-6">
              <div className="font-semibold min-h-[40px] pr-2 whitespace-pre-wrap">{extractCleanNotes(c.notes, c.nurse?.presentIllness || "")}</div>
              <div className="font-semibold min-h-[40px] pr-2">{c.menstrual_history}</div>
              <div className="font-semibold min-h-[40px] pr-2">{c.past_history}</div>
              <div className="font-semibold min-h-[40px]">{c.weight}</div>
            </div>
          </>
        )}

        {/* Doctor's Treatment & Prescription Section */}
        {( (c.dose_medicines && c.dose_medicines.length > 0) || c.prescription || c.medicines || c.tests ) && (
          <div className="mt-6 pt-4 border-t border-slate-300 flex flex-col gap-4">
            
            {/* 1. Prescription & Medicines */}
            {( (c.dose_medicines && c.dose_medicines.length > 0) || c.medicines ) && (
              <div>
                <div className="font-bold text-[13px] text-black mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="font-serif font-bold text-base text-[#b45309]">Rx</span>
                    <span>Prescription & Medicines (औषधोपचार) :</span>
                  </span>
                  {c.dose_medicines && c.dose_medicines.length > 0 && (
                    <span className="text-[10.5px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded border border-amber-300 flex items-center gap-1">
                      <Pill className="h-3 w-3 text-amber-700" />
                      <span>{c.dose_medicines.length} Medicines</span>
                    </span>
                  )}
                </div>

                {c.dose_medicines && c.dose_medicines.length > 0 ? (
                  <div className="rounded-lg border border-amber-300 bg-white overflow-hidden shadow-xs">
                    <table className="w-full text-[11.5px] text-left border-collapse font-sans">
                      <thead>
                        <tr className="bg-amber-100/70 border-b border-amber-200 text-black font-bold text-[11px]">
                          <th className="py-1.5 px-3 w-8 text-center">#</th>
                          <th className="py-1.5 px-3">औषध (Medicine)</th>
                          <th className="py-1.5 px-2 text-center w-36">डोस (स-दु-रा)</th>
                          <th className="py-1.5 px-3 text-center w-24">कालावधी</th>
                          <th className="py-1.5 px-3">सूचना</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100/80">
                        {c.dose_medicines.map((m: any, idx: number) => (
                          <tr key={m.id || idx} className={idx % 2 === 1 ? "bg-amber-50/30" : "bg-white"}>
                            <td className="py-1.5 px-3 text-center font-bold text-amber-800 text-[11px] align-middle">
                              {idx + 1}
                            </td>
                            <td className="py-1.5 px-3 font-serif font-bold text-black align-middle">
                              <div className="text-[12.5px]">{m.name}</div>
                              {m.strength && (
                                <span className="inline-block text-[9.5px] font-sans font-normal text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 mt-0.5">
                                  {m.strength}
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-center align-middle whitespace-nowrap">
                              <span className="inline-block font-mono font-bold text-xs bg-amber-50 text-amber-950 px-2 py-0.5 rounded border border-amber-300">
                                {m.morning_dose?.replace(' Tablet', '') || "0"} - {m.afternoon_dose?.replace(' Tablet', '') || "0"} - {m.evening_dose?.replace(' Tablet', '') || "0"}
                              </span>
                              {m.dose_code && <span className="text-[9.5px] text-slate-500 font-mono ml-1.5">[{m.dose_code}]</span>}
                            </td>
                            <td className="py-1.5 px-3 text-center font-semibold text-slate-800 align-middle whitespace-nowrap">
                              {m.duration}
                            </td>
                            <td className="py-1.5 px-3 text-slate-700 italic text-[11px] font-serif align-middle">
                              {m.instructions || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap font-medium text-xs bg-amber-50/40 p-2.5 rounded-lg border border-amber-200 text-black">
                    {c.medicines}
                  </div>
                )}
              </div>
            )}

            {/* 2. Clinical Tests */}
            {c.tests && (
              <div>
                <div className="font-bold text-[13px] text-black mb-1">
                  Clinical Tests (तपासण्या / लॅब टेस्ट) :
                </div>
                <div className="whitespace-pre-wrap font-medium text-xs bg-slate-50/70 p-2.5 rounded-lg border border-slate-200 text-black">
                  {c.tests}
                </div>
              </div>
            )}

            {/* 3. Advice */}
            {c.prescription && (
              <div>
                <div className="font-bold text-[13px] text-black mb-1">
                  Advice (विशेष सूचना / पथ्य) :
                </div>
                <div className="whitespace-pre-wrap font-medium text-xs bg-amber-50/50 p-2.5 rounded-lg border border-amber-200 text-black">
                  {c.prescription}
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Faint Swoosh Background */}
      <div className="absolute bottom-[-150px] left-[-150px] w-[600px] h-[600px] bg-[#fbbd08] opacity-[0.04] rounded-full z-0 pointer-events-none"></div>

      {/* Solid Yellow Footer */}
      <div className="absolute bottom-0 left-0 w-full h-[90px] z-0 pointer-events-none overflow-hidden">
        <svg preserveAspectRatio="none" viewBox="0 0 1000 100" className="w-full h-full">
          <path d="M0,100 L0,70 Q500,90 1000,10 L1000,100 Z" fill="#fbbd08" />
        </svg>
      </div>

      {/* Consent & Bottom Signatures */}
      <div className="relative z-10 px-12 pb-16 mt-auto flex flex-col justify-end min-h-[220px]">
        <div className="text-center font-bold text-[12px] text-black">Concent</div>
        <div className="text-[10px] text-black leading-tight text-justify mt-1.5 mb-8 font-medium">
          I, hereby consent to the collection of personal information for medical purposes. This includes demographic details, medical history, and contact information. I understand that this information is essential for accurate diagnosis and treatment planning. I authorize healthcare professionals to administer necessary treatments based on this collected information.I also grant permission for the collection of photos for medical records, research, and promotional activities related to healthcare. These images may be used anonymously to enhance medical understanding, contribute to research initiatives, and for promotional materials. I acknowledge that my personal information and images will be handled with utmost confidentiality and in compliance with applicable privacy laws.
        </div>

        <div className="flex flex-col mb-2 gap-3">
          <div className="flex items-end">
            <span className="font-bold text-[13px] text-black w-[80px]">Name :</span>
            <span className="font-semibold uppercase text-[13px]">{c.full_name}</span>
          </div>
          <div className="flex items-end">
            <span className="font-bold text-[13px] text-black w-[80px]">Signature :</span>
          </div>
        </div>
      </div>

      {/* Bottom Yellow Footer Content overlay */}
      <div className="absolute bottom-3 left-0 w-full z-10 px-12 flex flex-col items-end">
        <div className="flex items-center gap-1.5 text-black font-bold text-[12px] mb-1.5 mr-6">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
          </svg>
          9404306548 | 8867303202
        </div>
        <div className="text-[11px] text-black font-semibold">
          Address : Flat No. 106, Shiv City Center, Miraj Sangli Road, Near Vijaynagar Circle, Sangli. 416416
        </div>
      </div>
    </>
  );
}

function CasePaperCard({ c, setBusy }: { c: any; setBusy: (b: boolean) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Calculate initial scale synchronously so mobile renders immediately without crop
  const getInitialIsMobile = () => (typeof window !== "undefined" ? window.innerWidth < 820 : false);
  const getInitialScale = () => {
    if (typeof window === "undefined") return 1;
    const w = window.innerWidth;
    if (w < 820) {
      // Usable width on mobile (screen minus page padding)
      const available = Math.max(200, w - 24);
      return Math.min(1, available / 794);
    }
    return 1;
  };

  const [scale, setScale] = useState<number>(getInitialScale);
  const [contentHeight, setContentHeight] = useState<number>(1123);
  const [isFitMode, setIsFitMode] = useState<boolean>(true);
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(getInitialIsMobile);
  const [downloaded, setDownloaded] = useState<boolean>(false);

  useEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) return;
      
      const computedStyle = window.getComputedStyle(containerRef.current);
      const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
      const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
      const availableWidth = Math.max(200, containerRef.current.clientWidth - paddingLeft - paddingRight);
      
      const isMobile = window.innerWidth < 820 || availableWidth < 794;
      setIsMobileScreen(isMobile);

      // Measure unscaled content height dynamically from DOM
      const innerEl = contentRef.current;
      if (innerEl) {
        const measuredH = innerEl.scrollHeight || innerEl.offsetHeight || 1123;
        setContentHeight(Math.max(1123, measuredH));
      }

      if (isFitMode && isMobile) {
        const computedScale = Math.min(1, availableWidth / 794);
        setScale(computedScale);
      } else {
        setScale(1);
      }
    };

    updateDimensions();

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => updateDimensions()) : null;
    if (ro && containerRef.current) ro.observe(containerRef.current);
    if (ro && contentRef.current) ro.observe(contentRef.current);

    window.addEventListener("resize", updateDimensions);
    window.addEventListener("orientationchange", updateDimensions);

    return () => {
      window.removeEventListener("resize", updateDimensions);
      window.removeEventListener("orientationchange", updateDimensions);
      if (ro) ro.disconnect();
    };
  }, [isFitMode]);

  return (
    <div className="relative mx-auto w-full max-w-[850px] mb-8 bg-white dark:bg-slate-900 shadow-xl transition-all hover:shadow-2xl flex flex-col border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      {/* Top Header Bar with Status & Mobile Fit/Zoom Toggle */}
      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge className={statusColor[c.status as CaseStatus] || "bg-teal-50 text-teal-700 border-teal-300"} variant="outline">
            {statusLabel[c.status as CaseStatus] || "Submitted"}
          </Badge>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded font-semibold">
            ID: {(c.id || "").substring(0, 8).toUpperCase()}
          </span>
        </div>

        {/* View Mode Switch on Mobile/Tablet screens */}
        {isMobileScreen && (
          <div className="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-800 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setIsFitMode(true)}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                isFitMode
                  ? "bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>Fit Screen ({Math.round(scale * 100)}%)</span>
            </button>
            <button
              type="button"
              onClick={() => setIsFitMode(false)}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                !isFitMode
                  ? "bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <ZoomIn className="h-3.5 w-3.5" />
              <span>100% Zoom</span>
            </button>
          </div>
        )}
      </div>

      {/* Printable Area Wrapper with Clean Responsive Scaling */}
      <div 
        ref={containerRef} 
        className="w-full bg-slate-100/70 dark:bg-slate-950/40 p-1 sm:p-4 overflow-hidden flex justify-center items-start"
      >
        {isFitMode && isMobileScreen && scale < 1 ? (
          /* Auto-Fit Container: Scaled down proportionally without any cropping */
          <div className="w-full flex justify-center items-start overflow-hidden py-1">
            <div
              style={{
                width: `${Math.floor(794 * scale)}px`,
                height: `${Math.ceil(contentHeight * scale)}px`,
                position: "relative",
                overflow: "hidden",
                borderRadius: "4px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                flexShrink: 0,
              }}
            >
              <div
                ref={contentRef}
                id={`case-paper-${c.id}`}
                style={{
                  width: "794px",
                  minWidth: "794px",
                  minHeight: "1123px",
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  position: "absolute",
                  top: 0,
                  left: 0,
                }}
                className="bg-white relative flex flex-col text-black font-serif border border-slate-200 select-text"
              >
                <CasePaperContent c={c} showClinicalHistory={false} />
              </div>
            </div>
          </div>
        ) : (
          /* Full 100% Size Container: Smooth horizontal & vertical pan/scroll */
          <div className="w-full overflow-x-auto overflow-y-visible py-2 custom-scrollbar">
            <div className="min-w-[794px] w-[794px] mx-auto">
              <div
                ref={contentRef}
                id={`case-paper-${c.id}`}
                style={{
                  width: "794px",
                  minWidth: "794px",
                  minHeight: "1123px",
                }}
                className="bg-white relative flex flex-col text-black font-serif shadow-lg border border-slate-200 rounded-sm"
              >
                <CasePaperContent c={c} showClinicalHistory={false} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-900/90 flex flex-col sm:flex-row justify-between items-center gap-3 rounded-b-2xl">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>Created on {c.created_at ? new Date(c.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : new Date().toLocaleDateString("en-IN")}</span>
        </div>

        <div className="flex items-center justify-end w-full sm:w-auto gap-2 flex-wrap">
          {/* Download Button */}
          <Button
            onClick={async () => {
              setBusy(true);
              try {
                await generatePDFFromElementId(`case-paper-${c.id}`, `Case-Paper-${c.full_name || 'Patient'}`);
                setDownloaded(true);
                toast.success("केस पेपर PDF डाऊनलोड सुरू झाले आहे!");
                setTimeout(() => {
                  try {
                    if (window.opener) {
                      window.close();
                    }
                  } catch {
                    // Safe browser handling - leave user on completed case paper
                  }
                }, 1500);
              } catch (err) {
                console.error(err);
                toast.error("Failed to generate PDF.");
              } finally {
                setBusy(false);
              }
            }}
            className="flex-1 sm:flex-initial gap-1.5 shadow-md bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs h-9 px-3.5 font-bold"
          >
            {downloaded ? <CheckCircle2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            {downloaded ? "PDF Downloaded" : "Download PDF"}
          </Button>

          {/* Share Button */}
          <Button
            onClick={async () => {
              setBusy(true);
              try {
                await generatePDFFromElementId(`case-paper-${c.id}`, `Case-Paper-${c.full_name || 'Patient'}`, "share");
              } catch (err) {
                console.error(err);
                toast.error("Share failed.");
              } finally {
                setBusy(false);
              }
            }}
            variant="outline"
            className="flex-1 sm:flex-initial gap-1.5 shadow-sm border-amber-500 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-xl text-xs h-9 px-3.5"
          >
            <Share2 className="h-4 w-4" /> Share
          </Button>
        </div>
      </div>
    </div>
  );
}

function PatientPage() {
  const navigate = useNavigate();
  const { user, loading, refreshRole } = useAuth();
  const [form, setForm] = useState({ full_name: "", address: "", mobile: "", dob: "", notes: "", marital_status: "", education: "", occupation: "", parents_occupation: "", menstrual_history: "", past_history: "", weight: "", gender: "" });
  const [busy, setBusy] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [submittedCase, setSubmittedCase] = useState<any | null>(null);

  const age = useMemo(() => calculateAge(form.dob), [form.dob]);

  useEffect(() => {
    // Check if patient already submitted a case paper in this session
    try {
      const storedIds = JSON.parse(sessionStorage.getItem("healthbridge_submitted_case_ids") || "[]");
      if (Array.isArray(storedIds) && storedIds.length > 0 && !submittedCase) {
        const lastId = storedIds[storedIds.length - 1];
        getDocs(query(collection(db, "case_papers"), where("__name__", "==", lastId))).then((snap) => {
          if (!snap.empty) {
            const data = snap.docs[0].data();
            setSubmittedCase(parseCaseNotes({ id: lastId, ...data }));
          }
        }).catch((err) => console.warn("Could not reload session case", err));
      }
    } catch (e) {
      console.warn("Session storage error", e);
    }
  }, []);

  useEffect(() => {
    // Ensure form is completely blank whenever user opens the page
    setForm({
      full_name: "",
      address: "",
      mobile: "",
      dob: "",
      notes: "",
      marital_status: "",
      education: "",
      occupation: "",
      parents_occupation: "",
      menstrual_history: "",
      past_history: "",
      weight: "",
      gender: "",
    });
  }, []);

  useEffect(() => {
    const checkAndAutoLogin = async () => {
      if (loading) return;
      if (user) {
        if (user.email === "guest.patient@medicare.local" || user.isAnonymous) {
          try {
            const rolesQuery = query(collection(db, "user_roles"), where("user_id", "==", user.uid), where("role", "==", "patient"));
            const rolesSnapshot = await getDocs(rolesQuery);
            if (rolesSnapshot.empty) {
              await setDoc(doc(db, "user_roles", user.uid), { user_id: user.uid, role: "patient" }, { merge: true });
            }
          } catch (e) {
            console.warn("Could not sync patient role", e);
          }
        }
        setAuthChecking(false);
        return;
      }

      try {
        // 1. Try anonymous login first
        try {
          const anonRes = await signInAnonymously(auth);
          if (anonRes?.user) {
            setAuthChecking(false);
            return;
          }
        } catch (anonErr) {
          // Anonymous auth not enabled in console, proceed to guest accounts
        }

        // 2. Try guest email/password
        const guestEmail = "guest.patient@medicare.local";
        const guestPasswords = ["guestPassword123", "guest123", "patient123", "123456", "password123"];

        let signData: any = null;
        for (const pwd of guestPasswords) {
          try {
            signData = await signInWithEmailAndPassword(auth, guestEmail, pwd);
            if (signData?.user) break;
          } catch (e: any) {
            if (e?.code === "auth/user-not-found") {
              break;
            }
          }
        }

        // 3. If sign in failed, try creating the guest account
        if (!signData) {
          try {
            signData = await createUserWithEmailAndPassword(auth, guestEmail, "guestPassword123");
          } catch (createErr: any) {
            if (createErr?.code === "auth/email-already-in-use") {
              // Try creating a randomized guest user
              const randomGuest = `guest_${Date.now()}@medicare.local`;
              try {
                signData = await createUserWithEmailAndPassword(auth, randomGuest, "guestPassword123");
              } catch (rErr) {
                console.warn("Random guest creation failed:", rErr);
              }
            }
          }
        }

        if (signData?.user) {
          try {
            await setDoc(doc(db, "user_roles", signData.user.uid), { user_id: signData.user.uid, role: "patient" }, { merge: true });
            await setDoc(doc(db, "profiles", signData.user.uid), { full_name: "Guest Patient", email: signData.user.email || guestEmail }, { merge: true });
          } catch (docErr) {
            console.warn("Failed to set guest profile:", docErr);
          }
        }

        await refreshRole();
      } catch (err) {
        console.warn("Auto-login completed with fallback:", err);
      } finally {
        setAuthChecking(false);
      }
    };

    checkAndAutoLogin();
  }, [user, loading]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = schema.safeParse(form);
    if (!r.success) return toast.error(r.error.issues[0].message);
    
    setBusy(true);
    try {
      let patientUid = user?.uid || auth.currentUser?.uid;
      
      if (!patientUid) {
        try {
          const anon = await signInAnonymously(auth);
          patientUid = anon.user.uid;
        } catch (anonErr) {
          // Fallback guest identifier if Firebase auth is offline/restricted
          let localGuestId = sessionStorage.getItem("healthbridge_guest_uid");
          if (!localGuestId) {
            localGuestId = "guest_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
            sessionStorage.setItem("healthbridge_guest_uid", localGuestId);
          }
          patientUid = localGuestId;
        }
      }

      const newDocRef = doc(collection(db, "case_papers"));
      const newId = newDocRef.id;

      try {
        const existingIds = JSON.parse(sessionStorage.getItem("healthbridge_submitted_case_ids") || "[]");
        const updatedIds = Array.isArray(existingIds) ? [...existingIds, newId] : [newId];
        sessionStorage.setItem("healthbridge_submitted_case_ids", JSON.stringify(updatedIds));
      } catch (e) {
        console.error("Failed to save case id to session storage", e);
        sessionStorage.setItem("healthbridge_submitted_case_ids", JSON.stringify([newId]));
      }

      // 1. Check if this patient already has a permanent patient_id from a previous visit
      let patientIdToUse = "";
      try {
        const cleanMob = form.mobile.trim();
        const normName = form.full_name.trim().toLowerCase();
        
        // Check patients collection first
        if (cleanMob) {
          const patientsSnap = await getDocs(query(collection(db, "patients"), where("mobile", "==", cleanMob)));
          if (!patientsSnap.empty) {
            const match = patientsSnap.docs.find(d => (d.data()?.name || d.data()?.full_name || "").toLowerCase() === normName) || patientsSnap.docs[0];
            patientIdToUse = match.data()?.patientId || match.data()?.patient_id || match.id;
          }
        }
        
        // Also check case_papers collection
        if (!patientIdToUse && cleanMob) {
          const prevCasesSnap = await getDocs(query(collection(db, "case_papers"), where("mobile", "==", cleanMob)));
          if (!prevCasesSnap.empty) {
            const match = prevCasesSnap.docs.find(d => (d.data()?.full_name || "").toLowerCase() === normName) || prevCasesSnap.docs[0];
            const existingId = match.data()?.patient_id || match.data()?.patientId;
            if (existingId) {
              patientIdToUse = existingId;
            }
          }
        }
      } catch (err) {
        console.warn("Could not check previous patient id:", err);
      }

      // If brand new patient, generate sequential unique Patient ID (e.g. PT-000001)
      if (!patientIdToUse) {
        patientIdToUse = await getNextPatientId();
        try {
          await createPatientRecord({
            customPatientId: patientIdToUse,
            name: form.full_name.trim(),
            mobile: form.mobile.trim(),
            dob: form.dob,
            age,
            gender: form.gender || "Male",
            address: form.address.trim(),
            marital_status: form.marital_status || "Unmarried",
            education: form.education?.trim() || "",
            occupation: form.occupation?.trim() || "",
            parents_occupation: form.parents_occupation?.trim() || "",
          });
        } catch (savePatErr) {
          console.warn("Could not save initial patient record:", savePatErr);
        }
      }

      // Generate sequential visit Case Paper ID (e.g. CP-2026-0001)
      let casePaperIdToUse = `CP-${new Date().getFullYear()}-0001`;
      try {
        casePaperIdToUse = await getNextCasePaperId();
      } catch (cpErr) {
        console.warn("Could not generate case paper id:", cpErr);
      }

      const caseData = {
        patient_id: patientIdToUse,
        patientId: patientIdToUse,
        case_paper_id: casePaperIdToUse,
        casePaperId: casePaperIdToUse,
        full_name: form.full_name.trim(),
        address: form.address.trim(),
        mobile: form.mobile.trim(),
        dob: form.dob,
        age,
        gender: form.gender || "Male",
        marital_status: form.marital_status || "Unmarried",
        education: form.education?.trim() || "",
        occupation: form.occupation?.trim() || "",
        parents_occupation: form.parents_occupation?.trim() || "",
        menstrual_history: "",
        past_history: "",
        weight: "",
        notes: "",
        prescription: "",
        medicines: "",
        tests: "",
        dose_medicines: [],
        status: "submitted",
        patient: {
          name: form.full_name.trim(),
          dob: form.dob,
          age,
          gender: form.gender || "Male",
          mobile: form.mobile.trim(),
          maritalStatus: form.marital_status || "Unmarried",
          education: form.education?.trim() || "",
          address: form.address.trim(),
          occupation: form.occupation?.trim() || "",
          parentOccupation: form.parents_occupation?.trim() || ""
        },
        nurse: {
          presentIllness: "",
          menstrualHistory: "",
          pastHistory: "",
          weight: "",
          selectedDoctor: ""
        },
        doctor: {
          diagnosis: "",
          medicines: [],
          clinicalTests: "",
          advice: ""
        },
        billing: {
          consultationFee: 0,
          medicineCharges: 0,
          labCharges: 0,
          total: 0,
          status: "pending"
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await setDoc(newDocRef, caseData);

      const submittedPatientName = form.full_name.trim();
      setForm({ full_name: "", address: "", mobile: "", dob: "", notes: "", marital_status: "", education: "", occupation: "", parents_occupation: "", menstrual_history: "", past_history: "", weight: "", gender: "" });
      setBusy(false);
      setSubmittedCase({ id: newId, ...caseData });
      toast.success("अपॉइंटमेंट नोंदणी यशस्वी! Case ID: #" + newId.substring(0, 8).toUpperCase());
    } catch (err: any) {
      setBusy(false);
      return toast.error(err.message || "Failed to submit case paper. Please check connection.");
    } finally {
      setBusy(false);
    }
  };

  if (authChecking) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
        <p className="text-slate-500 font-medium text-sm">फॉर्म लोड होत आहे...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-16 pt-2 md:pt-4 px-1 sm:px-4">
      {/* Back to Home Button - Only show when filling registration form */}
      {!submittedCase && (
        <div className="flex items-center justify-between">
          <Button 
            type="button" 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate({ to: "/" })}
            className="gap-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-xl"
          >
            <ArrowLeft className="w-4 h-4" /> मुख्य पान (Home)
          </Button>
          <span className="text-xs text-muted-foreground font-medium">
            Moolatvam Ayurved
          </span>
        </div>
      )}

      {submittedCase ? (
        <div className="space-y-4">
          {/* Top Success Banner */}
          <div className="bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-emerald-500/15 border border-emerald-500/30 p-4 sm:p-5 rounded-2xl flex items-center gap-3.5 shadow-sm">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 grid place-items-center shrink-0">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2 flex-wrap">
                <span>केस पेपर यशस्वीरित्या तयार झाला!</span>
                <Badge variant="outline" className="bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 font-mono text-xs font-bold">
                  #{(submittedCase.id || "").substring(0, 8).toUpperCase()}
                </Badge>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                रुग्ण: <strong className="text-foreground uppercase">{submittedCase.full_name}</strong> • प्राथमिक माहिती हॉस्पिटल नर्स डॅशबोर्डमध्ये पाठवली आहे.
              </p>
            </div>
          </div>

          {/* THE GENERATED CASE PAPER - 100% VISIBLE & MOBILE RESPONSIVE */}
          <CasePaperCard c={submittedCase} setBusy={setBusy} />
        </div>
      ) : (
      <Card className="rounded-2xl sm:rounded-3xl p-4 sm:p-7 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 shadow-xl">
        <div className="border-b dark:border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/15 text-teal-600 dark:text-teal-400 grid place-items-center shadow-inner shrink-0">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                नवीन केस पेपर (New Case Paper)
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                रुग्ण केस पेपर नोंदणी व अपॉइंटमेंट फॉर्म (Patient Registration & Appointment Request)
              </p>
            </div>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-6 mt-6" autoComplete="off">
          {/* Section 1: Personal Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-200/60 dark:border-white/10 pb-1.5">
              <User className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                रुग्णाची माहिती (Personal Details)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Full Name (रुग्णाचे नाव) <span className="text-red-500">*</span>
                </Label>
                <div className="relative mt-1">
                  <Input 
                    value={form.full_name} 
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })} 
                    placeholder="Patient's Full Name" 
                    className="pr-10 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-white/10" 
                    required 
                  />
                  <VoiceButton onTranscript={(val) => setForm((f) => ({ ...f, full_name: f.full_name ? f.full_name + " " + val : val }))} />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Date of Birth (जन्मतारीख) <span className="text-red-500">*</span>
                </Label>
                <Input 
                  type="date" 
                  value={form.dob} 
                  onChange={(e) => setForm({ ...form, dob: e.target.value })} 
                  className="mt-1 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-white/10" 
                  required 
                />
                {form.dob && (
                  <div className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 mt-1">
                    Age: {age} Years
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Gender (लिंग)
                </Label>
                <Select value={form.gender} onValueChange={(val) => setForm({ ...form, gender: val })}>
                  <SelectTrigger className="mt-1 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-white/10">
                    <SelectValue placeholder="Select Gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male (पुरुष)</SelectItem>
                    <SelectItem value="Female">Female (स्त्री)</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Mobile Number (मोबाईल नं.) <span className="text-red-500">*</span>
                </Label>
                <Input 
                  value={form.mobile} 
                  onChange={(e) => setForm({ ...form, mobile: e.target.value })} 
                  placeholder="10 digit mobile number" 
                  className="mt-1 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-white/10" 
                  required 
                />
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Marital Status (वैवाहिक स्थिती)
                </Label>
                <Select value={form.marital_status} onValueChange={(val) => setForm({ ...form, marital_status: val })}>
                  <SelectTrigger className="mt-1 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-white/10">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Married">Married (विवाहित)</SelectItem>
                    <SelectItem value="Unmarried">Unmarried (अविवाहित)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Address (पत्ता) <span className="text-red-500">*</span>
                </Label>
                <div className="relative mt-1">
                  <Textarea 
                    rows={2} 
                    value={form.address} 
                    onChange={(e) => setForm({ ...form, address: e.target.value })} 
                    placeholder="Complete address with city/village..." 
                    className="pr-10 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-white/10 resize-none text-xs" 
                    required 
                  />
                  <VoiceButton onTranscript={(val) => setForm((f) => ({ ...f, address: f.address ? f.address + " " + val : val }))} positionClassName="top-2.5" />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Education (शिक्षण)
                </Label>
                <div className="relative mt-1">
                  <Input 
                    value={form.education} 
                    onChange={(e) => setForm({ ...form, education: e.target.value })} 
                    placeholder="e.g. B.Sc, 12th..." 
                    className="pr-10 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-white/10" 
                  />
                  <VoiceButton onTranscript={(val) => setForm((f) => ({ ...f, education: f.education ? f.education + " " + val : val }))} />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Occupation (व्यवसाय)
                </Label>
                <div className="relative mt-1">
                  <Input 
                    value={form.occupation} 
                    onChange={(e) => setForm({ ...form, occupation: e.target.value })} 
                    placeholder="e.g. Student, Service..." 
                    className="pr-10 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-white/10" 
                  />
                  <VoiceButton onTranscript={(val) => setForm((f) => ({ ...f, occupation: f.occupation ? f.occupation + " " + val : val }))} />
                </div>
              </div>

              <div className="sm:col-span-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Parent's Occu. (पालकांचा व्यवसाय)
                </Label>
                <div className="relative mt-1">
                  <Input 
                    value={form.parents_occupation} 
                    onChange={(e) => setForm({ ...form, parents_occupation: e.target.value })} 
                    placeholder="e.g. Farmer, Business..." 
                    className="pr-10 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-white/10" 
                  />
                  <VoiceButton onTranscript={(val) => setForm((f) => ({ ...f, parents_occupation: f.parents_occupation ? f.parents_occupation + " " + val : val }))} />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200/60 dark:border-white/10 flex justify-end">
            <Button 
              type="submit" 
              className="w-full sm:w-auto rounded-xl text-xs sm:text-sm h-11 px-8 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold shadow-md hover:shadow-lg transition-all" 
              disabled={busy}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Case Paper (केस पेपर नोंदवा)
            </Button>
          </div>
        </form>
      </Card>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background p-3 shadow-sm border border-border/50">
      <div className="text-[11px] font-bold uppercase tracking-wider text-primary/70 mb-1">{label}</div>
      <div className="truncate font-semibold text-base">{value}</div>
    </div>
  );
}
