import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { db } from "@/firebase";
import { collection, query as fsQuery, where, getDocs, orderBy } from "firebase/firestore";
import { statusColor, statusLabel, doctorName } from "@/lib/case-utils";
import { generatePDFFromElementId } from "@/lib/pdf";
import { CasePaperContent } from "@/routes/patient";
import { 
  History, 
  Calendar, 
  User, 
  FileText, 
  Download, 
  Printer, 
  Loader2, 
  ArrowLeft, 
  Eye, 
  Clock, 
  CheckCircle2, 
  Stethoscope,
  Smartphone,
  ZoomIn
} from "lucide-react";
import { toast } from "sonner";

interface CaseHistoryDialogProps {
  caseRow: any;
  allCases?: any[];
  trigger?: React.ReactNode;
}

export function CaseHistoryDialog({ caseRow, allCases, trigger }: CaseHistoryDialogProps) {
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [historyCases, setHistoryCases] = useState<any[]>([]);
  const [selectedCase, setSelectedCase] = useState<any | null>(null);

  // Patient users must NOT see Case Paper History
  if (role === "patient") {
    return null;
  }

  const loadHistory = async () => {
    if (!caseRow) return;
    setLoading(true);
    try {
      const cleanMobile = (caseRow.mobile || "").replace(/\D/g, "").slice(-10);
      const patientId = caseRow.patient_id;
      const patientName = (caseRow.full_name || "").trim().toLowerCase();

      let matchedCases: any[] = [];

      // 1. If allCases provided by parent (Nurse/Doctor/Admin state)
      if (allCases && allCases.length > 0) {
        matchedCases = allCases.filter((c: any) => {
          if (patientId && c.patient_id && c.patient_id === patientId) return true;
          const cMob = (c.mobile || "").replace(/\D/g, "").slice(-10);
          if (cleanMobile && cMob && cleanMobile.length === 10 && cleanMobile === cMob) return true;
          if (!cleanMobile && patientName && (c.full_name || "").trim().toLowerCase() === patientName) return true;
          return false;
        });
      }

      // 2. Also query Firestore directly if matchedCases is small to ensure 100% comprehensive history
      if (matchedCases.length <= 1) {
        const foundMap = new Map<string, any>();
        matchedCases.forEach((c) => foundMap.set(c.id, c));
        if (caseRow.id) foundMap.set(caseRow.id, caseRow);

        // Query by mobile
        if (cleanMobile && cleanMobile.length === 10) {
          try {
            const qMobile = fsQuery(collection(db, "case_papers"), where("mobile", "==", caseRow.mobile.trim()));
            const snap = await getDocs(qMobile);
            snap.forEach((doc) => foundMap.set(doc.id, { id: doc.id, ...doc.data() }));
          } catch (e) {
            console.warn("Firestore mobile history query failed", e);
          }
        }

        // Query by patient_id
        if (patientId) {
          try {
            const qPid = fsQuery(collection(db, "case_papers"), where("patient_id", "==", patientId));
            const snap = await getDocs(qPid);
            snap.forEach((doc) => foundMap.set(doc.id, { id: doc.id, ...doc.data() }));
          } catch (e) {
            console.warn("Firestore patient_id history query failed", e);
          }
        }

        matchedCases = Array.from(foundMap.values());
      }

      // Sort newest first
      matchedCases.sort((a, b) => {
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return timeB - timeA;
      });

      setHistoryCases(matchedCases);
    } catch (err) {
      console.error("Error loading patient case history:", err);
      toast.error("इतिहास लोड करताना त्रुटी आली.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSelectedCase(null);
      loadHistory();
    }
  }, [open, caseRow]);

  const handleOpenCase = (c: any) => {
    setSelectedCase(c);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ? (
          trigger
        ) : (
          <Button 
            size="sm" 
            variant="outline" 
            className="h-7 px-2.5 rounded-lg border-teal-500/40 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 text-xs font-semibold gap-1.5 shadow-2xs cursor-pointer"
            title="View Patient Case History"
          >
            <History className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            <span>Case History</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className={selectedCase ? "max-w-4xl w-[98vw] max-h-[92vh] overflow-y-auto p-4 sm:p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl" : "max-w-xl w-[95vw] rounded-2xl p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl"}>
        {selectedCase ? (
          /* READ-ONLY OLD CASE PAPER VIEW */
          <ReadOnlyCaseView 
            c={selectedCase} 
            isCurrent={selectedCase.id === caseRow?.id} 
            onBack={() => setSelectedCase(null)} 
          />
        ) : (
          /* CASE HISTORY LIST VIEW */
          <div className="space-y-4">
            <DialogHeader className="border-b border-slate-200/80 dark:border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                    <span>CASE HISTORY (केस इतिहास)</span>
                    <Badge variant="outline" className="bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300 border-teal-300 text-[10px]">
                      {historyCases.length} {historyCases.length === 1 ? "Visit" : "Visits"}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    रुग्ण: <strong className="text-foreground uppercase">{caseRow?.full_name}</strong> • फोन: {caseRow?.mobile || "-"}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
                <Loader2 className="h-7 w-7 animate-spin text-teal-600" />
                <p className="text-xs font-medium">इतिहास तपासत आहे...</p>
              </div>
            ) : historyCases.length === 0 ? (
              <div className="py-10 text-center space-y-2 bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 border border-dashed border-slate-300 dark:border-slate-700">
                <FileText className="h-8 w-8 text-slate-400 mx-auto" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No previous case history found.</p>
                <p className="text-xs text-slate-500">या रुग्णाचा कोणताही मागील केस इतिहास आढळला नाही.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
                {historyCases.length === 1 && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800/50 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>No previous case history found. Only current visit registered.</span>
                  </div>
                )}

                {historyCases.map((c, index) => {
                  const isCurrent = c.id === caseRow?.id;
                  const visitDate = c.created_at 
                    ? new Date(c.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                    : "Unknown Date";
                  const docName = c.assigned_doctor_name || (c.assigned_doctor && (doctorName as any)[c.assigned_doctor]) || "Dr. Kadambari Jagtap";

                  return (
                    <div 
                      key={c.id || index}
                      className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                        isCurrent 
                          ? "bg-teal-50/60 dark:bg-teal-950/20 border-teal-300 dark:border-teal-800 shadow-2xs" 
                          : "bg-white dark:bg-slate-800/60 border-slate-200 dark:border-white/10 hover:border-slate-300"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-xs text-foreground flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-teal-600" />
                            {visitDate}
                          </span>
                          <span className="font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/60 px-1.5 py-0.5 rounded">
                            Case Paper ID: #{(c.id || "").substring(0, 8).toUpperCase()}
                          </span>
                          {isCurrent && (
                            <Badge className="bg-teal-600 text-white text-[9.5px] px-1.5 py-0">
                              Current Visit
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Stethoscope className="h-3 w-3 text-slate-500" />
                            Doctor: <strong className="text-foreground">{docName}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Status: <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${statusColor[c.status as keyof typeof statusColor] || "bg-slate-100"}`}>
                              {statusLabel[c.status as keyof typeof statusLabel] || c.status}
                            </Badge>
                          </span>
                          {c.total_bill ? (
                            <>
                              <span>•</span>
                              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                                Bill: ₹{Number(c.total_bill).toFixed(2)}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="w-full sm:w-auto flex items-center justify-end">
                        <Button
                          size="sm"
                          onClick={() => handleOpenCase(c)}
                          className="w-full sm:w-auto rounded-xl text-xs h-8 px-3.5 font-bold bg-teal-600 hover:bg-teal-700 text-white gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>View (पहा)</span>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * 100% READ ONLY Case Paper Viewer
 * Absolutely no save/edit inputs or buttons
 */
export function ReadOnlyCaseView({ c, isCurrent, onBack }: { c: any; isCurrent: boolean; onBack: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const getInitialIsMobile = () => (typeof window !== "undefined" ? window.innerWidth < 820 : false);
  const getInitialScale = () => {
    if (typeof window === "undefined") return 1;
    const w = window.innerWidth;
    if (w < 820) {
      const available = Math.max(200, w - 24);
      return Math.min(1, available / 794);
    }
    return 1;
  };

  const [scale, setScale] = useState<number>(getInitialScale);
  const [contentHeight, setContentHeight] = useState<number>(1123);
  const [isFitMode, setIsFitMode] = useState<boolean>(true);
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(getInitialIsMobile);

  useEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) return;
      const computedStyle = window.getComputedStyle(containerRef.current);
      const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
      const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
      const availableWidth = Math.max(200, containerRef.current.clientWidth - paddingLeft - paddingRight);
      const isMobile = window.innerWidth < 820 || availableWidth < 794;
      setIsMobileScreen(isMobile);

      const innerEl = contentRef.current;
      if (innerEl) {
        const measuredH = innerEl.scrollHeight || innerEl.offsetHeight || 1123;
        setContentHeight(Math.max(1123, measuredH));
      }

      if (isFitMode && isMobile) {
        setScale(Math.min(1, availableWidth / 794));
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

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await generatePDFFromElementId(`case-history-${c.id}`, `Case-Paper-${c.full_name || 'Patient'}`);
      toast.success("PDF डाऊनलोड सुरू झाले आहे!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate PDF.");
    } finally {
      setDownloading(false);
    }
  };

  const formattedDate = c.created_at 
    ? new Date(c.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "";

  return (
    <div className="space-y-3">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200 dark:border-white/10">
        <div className="flex items-center gap-2">
          <Button 
            type="button" 
            variant="ghost" 
            size="sm" 
            onClick={onBack}
            className="rounded-xl h-8 px-2.5 gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to History (मागे जा)</span>
          </Button>
          <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border-amber-300 text-xs font-bold">
            READ ONLY (फक्त पाहण्यासाठी)
          </Badge>
          {isCurrent && (
            <Badge className="bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-300 border-teal-300 text-xs">
              Current Active Case
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="rounded-xl text-xs h-8 px-3 font-semibold gap-1.5"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleDownload}
            disabled={downloading}
            className="rounded-xl text-xs h-8 px-3 font-bold bg-amber-600 hover:bg-amber-700 text-white gap-1.5 shadow-sm"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span>Download PDF</span>
          </Button>
        </div>
      </div>

      {/* Info notice strip */}
      <div className="flex items-center justify-between text-xs bg-slate-100 dark:bg-slate-800 p-2.5 rounded-xl text-slate-700 dark:text-slate-300 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span>Date: <strong>{formattedDate}</strong></span>
          <span>•</span>
          <span>ID: <strong className="font-mono">#{(c.id || "").substring(0, 8).toUpperCase()}</strong></span>
          <span>•</span>
          <span>Doctor: <strong>{c.assigned_doctor_name || (c.assigned_doctor && (doctorName as any)[c.assigned_doctor]) || "Dr. Kadambari Jagtap"}</strong></span>
        </div>
        {isMobileScreen && (
          <div className="flex items-center gap-1 bg-white dark:bg-slate-700 p-0.5 rounded-lg border border-slate-200 dark:border-slate-600">
            <button
              type="button"
              onClick={() => setIsFitMode(true)}
              className={`px-2 py-0.5 text-[11px] font-semibold rounded ${isFitMode ? "bg-teal-600 text-white" : "text-slate-600 dark:text-slate-300"}`}
            >
              Fit Screen
            </button>
            <button
              type="button"
              onClick={() => setIsFitMode(false)}
              className={`px-2 py-0.5 text-[11px] font-semibold rounded ${!isFitMode ? "bg-teal-600 text-white" : "text-slate-600 dark:text-slate-300"}`}
            >
              100%
            </button>
          </div>
        )}
      </div>

      {/* Case Paper Rendered in Read-Only Mode */}
      <div 
        ref={containerRef} 
        className="w-full bg-slate-100/70 dark:bg-slate-950/40 p-1 sm:p-3 overflow-hidden flex justify-center items-start rounded-xl"
      >
        {isFitMode && isMobileScreen && scale < 1 ? (
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
                id={`case-history-${c.id}`}
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
                <CasePaperContent c={c} />
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full overflow-x-auto overflow-y-visible py-2 custom-scrollbar">
            <div className="min-w-[794px] w-[794px] mx-auto">
              <div
                ref={contentRef}
                id={`case-history-${c.id}`}
                style={{
                  width: "794px",
                  minWidth: "794px",
                  minHeight: "1123px",
                }}
                className="bg-white relative flex flex-col text-black font-serif shadow-lg border border-slate-200 rounded-sm"
              >
                <CasePaperContent c={c} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
