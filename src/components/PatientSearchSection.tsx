import { useState, useEffect } from "react";
import { 
  searchPatients, 
  getCasePapersForPatient, 
  updatePatientMobileNumber, 
  maskMobile, 
  PatientRecord 
} from "@/lib/patient-service";
import { statusColor, statusLabel, doctorName } from "@/lib/case-utils";
import { ReadOnlyCaseView } from "@/components/CaseHistoryDialog";
import { useAuth } from "@/hooks/use-auth";
import { 
  Search, 
  User, 
  Phone, 
  Calendar, 
  History, 
  FileText, 
  ArrowLeft, 
  CheckCircle2, 
  Clock, 
  Edit3, 
  Eye, 
  Loader2, 
  X, 
  ShieldCheck,
  Stethoscope,
  PlusCircle
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface PatientSearchSectionProps {
  allCases?: any[];
  onCreateNewVisit?: (patient: PatientRecord) => void;
  className?: string;
  defaultExpanded?: boolean;
}

export function PatientSearchSection({
  allCases,
  onCreateNewVisit,
  className = "",
  defaultExpanded = true,
}: PatientSearchSectionProps) {
  const { role } = useAuth();

  // Patient users must NOT see Patient Search or Case History
  if (role === "patient") {
    return null;
  }

  const [queryText, setQueryText] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PatientRecord[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Selected patient profile view
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
  const [patientCases, setPatientCases] = useState<any[]>([]);
  const [loadingCases, setLoadingCases] = useState(false);

  // Case viewing modal state
  const [viewingCase, setViewingCase] = useState<any | null>(null);

  // Mobile number update dialog
  const [editMobileOpen, setEditMobileOpen] = useState(false);
  const [newMobile, setNewMobile] = useState("");
  const [savingMobile, setSavingMobile] = useState(false);

  // Trigger search
  const performSearch = async (val?: string) => {
    const q = (val !== undefined ? val : queryText).trim();
    if (!q) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setSearching(true);
    setHasSearched(true);
    try {
      const found = await searchPatients(q, allCases);
      setResults(found);
    } catch (err) {
      console.error("Patient search error:", err);
      toast.error("Failed to search patients.");
    } finally {
      setSearching(false);
    }
  };

  // Debounced auto-search as user types
  useEffect(() => {
    const timer = setTimeout(() => {
      if (queryText.trim().length >= 2) {
        performSearch(queryText);
      } else if (queryText.trim().length === 0) {
        setResults([]);
        setHasSearched(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [queryText]);

  // Load history cases when a patient is selected
  const handleSelectPatient = async (patient: PatientRecord) => {
    setSelectedPatient(patient);
    setLoadingCases(true);
    try {
      const cases = await getCasePapersForPatient(patient.patientId, allCases);
      setPatientCases(cases);
    } catch (err) {
      console.error("Failed to load patient cases:", err);
      toast.error("Failed to load patient case history.");
    } finally {
      setLoadingCases(false);
    }
  };

  // Handle saving updated mobile number
  const handleSaveMobile = async () => {
    if (!selectedPatient) return;
    const cleanMob = newMobile.trim().replace(/\D/g, "");
    if (cleanMob.length < 10) {
      toast.error("Please enter a valid 10-digit mobile number.");
      return;
    }

    setSavingMobile(true);
    try {
      await updatePatientMobileNumber(selectedPatient.patientId, cleanMob);
      // Update local states
      const updatedPatient = { ...selectedPatient, mobile: cleanMob };
      setSelectedPatient(updatedPatient);
      setResults((prev) =>
        prev.map((p) => (p.patientId === selectedPatient.patientId ? { ...p, mobile: cleanMob } : p))
      );
      toast.success(`Mobile updated to ${cleanMob}. Patient ID ${selectedPatient.patientId} remains permanent.`);
      setEditMobileOpen(false);
    } catch (err) {
      console.error("Failed to update mobile:", err);
      toast.error("Failed to update mobile number.");
    } finally {
      setSavingMobile(false);
    }
  };

  const handleClearSearch = () => {
    setQueryText("");
    setResults([]);
    setHasSearched(false);
    setSelectedPatient(null);
  };

  return (
    <Card className={`border border-slate-200/80 dark:border-white/10 shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden ${className}`}>
      {/* ═══════════════ HEADER & SEARCH BAR ═══════════════ */}
      <CardHeader className="p-4 sm:p-5 bg-gradient-to-r from-teal-500/5 via-emerald-500/5 to-transparent border-b border-slate-100 dark:border-white/5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base sm:text-lg font-bold text-slate-850 dark:text-white flex items-center gap-2">
              <Search className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              <span>Patient Search & Case History</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Search by permanent <strong>Patient ID (e.g. PT-000123)</strong>, <strong>Name</strong>, or <strong>Mobile Number</strong>
            </p>
          </div>

          {selectedPatient && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedPatient(null)}
              className="text-xs h-8 rounded-xl border-dashed gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Search Results</span>
            </Button>
          )}
        </div>

        {/* Search Input Bar */}
        <div className="mt-3 relative w-full flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && performSearch()}
              placeholder="Search by Patient ID, Name or Mobile Number..."
              className="pl-10 pr-9 bg-background/80 border-slate-200 dark:border-white/10 rounded-xl h-10 text-sm focus-visible:ring-teal-500"
            />
            {queryText && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full"
                title="Clear"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button
            type="button"
            onClick={() => performSearch()}
            disabled={searching || !queryText.trim()}
            className="h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold gap-1.5 shrink-0"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="hidden sm:inline">Search</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5">
        {/* ═══════════════ SELECTED PATIENT PROFILE VIEW ═══════════════ */}
        {selectedPatient ? (
          <div className="space-y-5 animate-in fade-in-50 duration-200">
            {/* Patient Profile Header Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-teal-50/60 dark:bg-teal-950/20 border border-teal-200/80 dark:border-teal-800/40 shadow-2xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Info Block */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-lg font-extrabold text-slate-900 dark:text-white uppercase tracking-wide">
                      {selectedPatient.name || selectedPatient.full_name}
                    </h3>
                    <Badge className="bg-teal-600 text-white font-mono text-xs px-2.5 py-0.5 shadow-2xs">
                      {selectedPatient.patientId}
                    </Badge>
                  </div>

                  <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                    <span>Age: <strong className="text-foreground">{selectedPatient.age || "-"} yrs</strong></span>
                    <span>•</span>
                    <span>Gender: <strong className="text-foreground">{selectedPatient.gender || "-"}</strong></span>
                    {selectedPatient.dob && (
                      <>
                        <span>•</span>
                        <span>DOB: <strong className="text-foreground">{selectedPatient.dob}</strong></span>
                      </>
                    )}
                    <span>•</span>
                    <span>
                      Current Mobile:{" "}
                      <strong className="text-foreground font-mono">{selectedPatient.mobile || "-"}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Last Visit:{" "}
                      <strong className="text-foreground">
                        {selectedPatient.lastVisit
                          ? new Date(selectedPatient.lastVisit).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "-"}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Profile Actions: Update Mobile & New Visit */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setNewMobile(selectedPatient.mobile || "");
                      setEditMobileOpen(true);
                    }}
                    className="h-8 text-xs font-semibold rounded-xl border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-100/50 dark:hover:bg-teal-900/40 gap-1.5"
                    title="Update current phone number without changing Patient ID"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Change Mobile</span>
                  </Button>

                  {onCreateNewVisit && (
                    <Button
                      size="sm"
                      onClick={() => onCreateNewVisit(selectedPatient)}
                      className="h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5 shadow-2xs"
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      <span>New Visit</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Case History Section for Selected Patient */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <History className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  <span>CASE HISTORY ({patientCases.length} {patientCases.length === 1 ? "Visit" : "Visits"})</span>
                </h4>
                <span className="text-[11px] text-muted-foreground">Newest visits shown first</span>
              </div>

              {loadingCases ? (
                <div className="py-10 flex flex-col items-center justify-center gap-2 text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
                  <p className="text-xs">Loading case papers...</p>
                </div>
              ) : patientCases.length === 0 ? (
                <div className="py-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-white/10 p-4">
                  <FileText className="h-7 w-7 text-slate-400 mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">No previous Case Papers found.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[450px] overflow-y-auto pr-1">
                  {patientCases.map((c, index) => {
                    const visitDate = c.created_at
                      ? new Date(c.created_at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "Recent Visit";
                    const docTitle =
                      c.assigned_doctor_name ||
                      (c.assigned_doctor && (doctorName as any)[c.assigned_doctor]) ||
                      "Dr. Kadambari Jagtap";
                    const cpId = c.case_paper_id || c.casePaperId || `CP-${(c.id || "").slice(0, 8).toUpperCase()}`;

                    return (
                      <div
                        key={c.id || index}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/60 hover:bg-slate-50/80 dark:hover:bg-slate-800 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-xs text-foreground flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-teal-600" />
                              {visitDate}
                            </span>
                            <Badge variant="outline" className="font-mono text-[11px] font-semibold bg-slate-100 dark:bg-slate-700/60 border-slate-300 dark:border-white/10 px-2 py-0.5">
                              Case Paper: {cpId}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`text-[10px] py-0 px-2 ${statusColor[c.status as keyof typeof statusColor] || "bg-slate-100"}`}
                            >
                              {statusLabel[c.status as keyof typeof statusLabel] || c.status}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>Doctor: <strong className="text-foreground">{docTitle}</strong></span>
                            {c.total_bill && (
                              <>
                                <span>•</span>
                                <span>Bill: <strong className="text-foreground">₹{c.total_bill}</strong></span>
                              </>
                            )}
                          </div>
                        </div>

                        <Button
                          size="sm"
                          onClick={() => setViewingCase(c)}
                          className="h-8 px-3 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-xl gap-1.5 shrink-0 shadow-2xs"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>View (Read Only)</span>
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ═══════════════ SEARCH RESULTS LIST ═══════════════ */
          <div>
            {searching ? (
              <div className="py-10 flex flex-col items-center justify-center gap-2 text-slate-500">
                <Loader2 className="h-7 w-7 animate-spin text-teal-600" />
                <p className="text-xs font-medium">Searching patient records...</p>
              </div>
            ) : hasSearched && results.length === 0 ? (
              <div className="py-10 text-center space-y-2 bg-slate-50/70 dark:bg-slate-800/40 rounded-xl p-4 border border-dashed border-slate-200 dark:border-white/10">
                <User className="h-8 w-8 text-slate-400 mx-auto" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No patient found.</p>
                <p className="text-xs text-muted-foreground">
                  Check the Patient ID, mobile number, or spelling and try again.
                </p>
              </div>
            ) : results.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground pb-1">
                  <span>Found {results.length} {results.length === 1 ? "matching patient" : "matching patients"}:</span>
                  <span className="text-[11px] italic">Select patient to view history</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
                  {results.map((p) => {
                    const masked = maskMobile(p.mobile);
                    const lastVisitFormatted = p.lastVisit
                      ? new Date(p.lastVisit).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "-";

                    return (
                      <div
                        key={p.patientId || p.id}
                        className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/70 hover:border-teal-500/50 hover:shadow-md transition-all flex flex-col justify-between gap-3 group"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-extrabold text-sm text-foreground uppercase tracking-wide group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                              {p.name || p.full_name}
                            </span>
                            <Badge className="bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30 font-mono text-[11px] px-2 py-0.5">
                              {p.patientId}
                            </Badge>
                          </div>

                          {/* Identifying Info for Duplicate Safety */}
                          <div className="text-xs text-muted-foreground space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>Age: <strong className="text-foreground">{p.age || "-"}</strong></span>
                              <span>•</span>
                              <span>Gender: <strong className="text-foreground">{p.gender || "Male"}</strong></span>
                              {p.dob && (
                                <>
                                  <span>•</span>
                                  <span>DOB: <strong className="text-foreground">{p.dob}</strong></span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>Mobile: <strong className="text-foreground font-mono">{masked}</strong></span>
                              <span>•</span>
                              <span>Last Visit: <strong className="text-foreground">{lastVisitFormatted}</strong></span>
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
                          <Button
                            size="sm"
                            onClick={() => handleSelectPatient(p)}
                            className="flex-1 h-8 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg gap-1.5"
                          >
                            <User className="h-3.5 w-3.5" />
                            <span>View Patient</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSelectPatient(p)}
                            className="h-8 text-xs font-semibold rounded-lg border-teal-500/30 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 gap-1.5"
                          >
                            <History className="h-3.5 w-3.5" />
                            <span>View History</span>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground italic">
                Enter Patient ID (e.g. <code>PT-000123</code>), patient name, or mobile number above to search.
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* ═══════════════ EDIT MOBILE NUMBER MODAL ═══════════════ */}
      <Dialog open={editMobileOpen} onOpenChange={setEditMobileOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Phone className="h-5 w-5 text-teal-600" />
              <span>Update Patient Mobile Number</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Patient ID <strong className="text-foreground font-mono">{selectedPatient?.patientId}</strong> remains permanent.
              Changing mobile number will NEVER break existing Case Paper history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Patient Name</Label>
              <div className="text-sm font-bold text-foreground mt-0.5">
                {selectedPatient?.name || selectedPatient?.full_name}
              </div>
            </div>

            <div>
              <Label htmlFor="new-mobile" className="text-xs font-semibold">
                New Mobile Number (10 digits)
              </Label>
              <Input
                id="new-mobile"
                type="tel"
                maxLength={10}
                placeholder="Enter 10-digit mobile number"
                value={newMobile}
                onChange={(e) => setNewMobile(e.target.value.replace(/\D/g, ""))}
                className="mt-1 font-mono text-sm rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditMobileOpen(false)}
              disabled={savingMobile}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveMobile}
              disabled={savingMobile || newMobile.trim().length < 10}
              className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold gap-1.5"
            >
              {savingMobile && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Save Mobile Number</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════ READ ONLY CASE PAPER MODAL ═══════════════ */}
      <Dialog open={!!viewingCase} onOpenChange={(open) => !open && setViewingCase(null)}>
        <DialogContent className="max-w-4xl w-[98vw] max-h-[92vh] overflow-y-auto p-4 sm:p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl">
          {viewingCase && (
            <ReadOnlyCaseView
              c={viewingCase}
              isCurrent={false}
              onBack={() => setViewingCase(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
