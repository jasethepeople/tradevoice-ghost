"use client";

import {
  Activity, ArrowRight, ArrowUpRight, AudioLines, BadgeCheck,
  BarChart3, CalendarClock, Check, ChevronDown, ChevronRight, Clock3, Download,
  FileAudio2, FileUp, Headphones, House, LifeBuoy, Menu, MoreHorizontal,
  Phone, PhoneCall, Play, Search, Settings2, ShieldAlert, ShieldCheck,
  Sparkles, Wrench, X, Zap,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { parseCsv } from "@/lib/csv-audit";

type CallStatus = "Booked" | "Needs review" | "Missed" | "Resolved";
type Severity = "High" | "Medium" | "Low";
type Call = {
  id: string;
  name: string;
  phone: string;
  issue: string;
  trade: string;
  severity: Severity;
  status: CallStatus;
  time: string;
  duration: string;
  location: string;
  notes: string;
  recordingUrl?: string;
};
type Audit = { total: number; missed: number; examples: string[] };

const initialCalls: Call[] = [
  { id: "TV-2048", name: "Jordan Mitchell", phone: "(303) 555-0186", issue: "AC not cooling · unit blowing warm air", trade: "HVAC", severity: "High", status: "Needs review", time: "10:42 AM", duration: "2:18", location: "Lakewood, CO", notes: "Home is 84°F and climbing. Thermostat is on; breaker appears on. Customer is available for same-day service." },
  { id: "TV-2047", name: "Rosa Martinez", phone: "(720) 555-0142", issue: "Water under kitchen sink", trade: "Plumbing", severity: "Medium", status: "Booked", time: "10:16 AM", duration: "3:41", location: "Arvada, CO", notes: "Slow leak from cabinet supply line. Customer knows where the main shutoff is. Requested the next available visit." },
  { id: "TV-2046", name: "Elliot Parker", phone: "(303) 555-0119", issue: "Outlet sparked · breaker tripped", trade: "Electrical", severity: "High", status: "Needs review", time: "9:53 AM", duration: "1:56", location: "Denver, CO", notes: "Customer reports one spark, no smoke or injury. Agent told them not to touch the outlet and escalated for owner follow-up." },
  { id: "TV-2045", name: "Nina Chen", phone: "(720) 555-0164", issue: "Furnace tune-up request", trade: "HVAC", severity: "Low", status: "Booked", time: "9:21 AM", duration: "2:52", location: "Wheat Ridge, CO", notes: "Routine maintenance. Furnace is operating normally. Customer prefers a morning appointment." },
  { id: "TV-2044", name: "Caleb Brooks", phone: "(303) 555-0127", issue: "Possible slab leak · warm floor", trade: "Plumbing", severity: "Medium", status: "Needs review", time: "8:47 AM", duration: "4:07", location: "Golden, CO", notes: "Warm patch near the hallway and water bill is higher than usual. No standing water. Owner notified for next-day booking." },
];

const planInfo = {
  starter: { label: "Ghost 100", minutes: 100, price: 49 },
  growth: { label: "Ghost 300", minutes: 300, price: 99 },
  pro: { label: "Ghost 800", minutes: 800, price: 199 },
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export default function Home() {
  const [calls, setCalls] = useState(initialCalls);
  const [page, setPage] = useState("Overview");
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [search, setSearch] = useState("");
  const [audit, setAudit] = useState<Audit | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [avgJob, setAvgJob] = useState(620);
  const [trade, setTrade] = useState("HVAC");
  const [plan, setPlan] = useState<keyof typeof planInfo>("growth");
  const [ownerPhone, setOwnerPhone] = useState("(303) 555-0100");
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentPlan = planInfo[plan];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedSettings = localStorage.getItem("tradevoice-settings");
        if (savedSettings) {
          const settings = JSON.parse(savedSettings) as { avgJob?: number; trade?: string; plan?: string; ownerPhone?: string };
          if (typeof settings.avgJob === "number" && settings.avgJob > 0) setAvgJob(settings.avgJob);
          if (["HVAC", "Plumbing", "Electrical"].includes(settings.trade ?? "")) setTrade(settings.trade!);
          if (settings.plan && settings.plan in planInfo) setPlan(settings.plan as keyof typeof planInfo);
          if (typeof settings.ownerPhone === "string") setOwnerPhone(settings.ownerPhone);
        }
      } catch {
        localStorage.removeItem("tradevoice-settings");
      }
    }, 0);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    return () => window.clearTimeout(timer);
  }, []);

  const filteredCalls = useMemo(() => calls.filter((call) =>
    `${call.name} ${call.phone} ${call.issue} ${call.trade} ${call.status}`.toLowerCase().includes(search.toLowerCase())
  ), [calls, search]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast("That file is over 10 MB. Export a smaller date range and try again.");
      event.target.value = "";
      return;
    }
    const contents = await file.text();
    const result = parseCsv(contents);
    setUploadName(file.name);
    if (!result.total) {
      setAudit(null);
      showToast("I couldn't find call rows in that CSV. Check that the first row has column headers.");
    } else {
      setAudit({ total: result.total, missed: result.missed, examples: result.examples });
      setPage("Free call audit");
    }
    event.target.value = "";
  }

  function approve(call: Call) {
    setCalls((current) => current.map((item) => item.id === call.id ? { ...item, status: "Booked" } : item));
    setSelectedCall(null);
    showToast("Booking approved. Connect Jobber or Housecall Pro to sync it to your schedule.");
  }

  function saveSettings() {
    localStorage.setItem("tradevoice-settings", JSON.stringify({ avgJob, trade, plan, ownerPhone }));
    setSaved(true);
    showToast("Your settings are saved on this device.");
    window.setTimeout(() => setSaved(false), 2400);
  }

  const nav = [
    { label: "Overview", icon: House },
    { label: "Calls", icon: Phone },
    { label: "Free call audit", icon: BarChart3 },
    { label: "Settings", icon: Settings2 },
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><AudioLines size={20} strokeWidth={2.5} /></div>
          <div><div className="brand-name">tradevoice<span>ghost</span></div><div className="brand-sub">THE AFTER-HOURS ADVANTAGE</div></div>
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <div className="shop-switcher"><div className="shop-avatar">B</div><div className="shop-info"><strong>Bluebird Mechanical</strong><span>2 trucks · Denver, CO</span></div><ChevronDown size={15} className="switcher-chevron" /></div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {nav.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${page === label ? "nav-active" : ""}`} onClick={() => { setPage(label); setMobileNav(false); }}><Icon size={18} /><span>{label}</span>{label === "Calls" && <span className="nav-count">12</span>}</button>)}
        </nav>
        <div className="sidebar-divider" />
        <div className="nav-label">YOUR RECEPTIONIST</div>
        <div className="agent-card"><div className="agent-card-top"><div className="agent-avatar"><AudioLines size={17} /></div><span className="live-dot" /> <span className="agent-live">ON DUTY</span><MoreHorizontal size={17} className="agent-more" /></div><strong>Ghost · {trade} desk</strong><span className="agent-caption">Catching every call, day & night</span><div className="agent-divider" /><div className="agent-number"><PhoneCall size={14} /> +1 (720) 555-0188 <Check size={13} /></div></div>
        <div className="sidebar-bottom"><button className="help-link" onClick={() => showToast("Support setup: add your help email in the launch checklist.")}><LifeBuoy size={16} /> Help & setup guide <ArrowRight size={14} /></button><div className="user-profile"><div className="user-avatar">JD</div><div><strong>Jamie Davis</strong><span>Owner</span></div><MoreHorizontal size={18} className="user-more" /></div></div>
      </aside>

      {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="Close menu" />}

      <main className="main-content">
        <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20} /></button><div className="breadcrumb"><span>Bluebird Mechanical</span><ChevronRight size={15} /><strong>{page}</strong></div><div className="topbar-right"><div className="live-status"><span className="live-dot" /> Ghost is on</div><button className="topbar-help" onClick={() => setPage("Settings")}>Setup guide <ArrowRight size={14} /></button><div className="topbar-avatar">JD</div></div></header>

        <div className="page-wrap">
          <div className="demo-banner"><span className="demo-dot" /> DEMO WORKSPACE <span>Showing sample calls and illustrative results. Connect your accounts to go live.</span></div>

          {page === "Overview" && <>
            <section className="welcome-row"><div><div className="eyebrow">WEDNESDAY, OCTOBER 28, 2026 <span className="eyebrow-line" /> YOUR SHOP IS COVERED</div><h1>Good morning, Jamie <span className="wave">✳</span></h1><p className="welcome-copy">Ghost is picking up while you’re on the job. Here’s what it caught.</p></div><button className="button button-dark" onClick={() => setPage("Free call audit")}><FileUp size={16} /> Run a free call audit</button></section>

            <section className="metric-grid" aria-label="Call performance">
              <div className="metric-card metric-highlight"><div className="metric-head"><span>Recovered this month</span><span className="metric-icon green-icon"><ArrowUpRight size={17} /></span></div><div className="metric-value">$22,940</div><div className="metric-foot"><span className="trend-pill"><ArrowUpRight size={13} /> 18%</span><span>vs. last month</span><span className="metric-foot-right">Illustrative</span></div><div className="metric-spark"><svg viewBox="0 0 160 35" preserveAspectRatio="none" aria-hidden="true"><path d="M0 28 C13 27 14 20 27 22 S47 29 58 20 75 26 87 15 104 21 117 11 136 16 146 4 156 10 160 2" fill="none" stroke="#6cab77" strokeWidth="2"/><path d="M0 30 C13 29 14 22 27 24 S47 31 58 22 75 28 87 17 104 23 117 13 136 18 146 6 156 12 160 4 V35 H0Z" fill="url(#fade)"/><defs><linearGradient id="fade" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#88bd87" stopOpacity=".18"/><stop offset="1" stopColor="#88bd87" stopOpacity="0"/></linearGradient></defs></svg></div></div>
              <div className="metric-card"><div className="metric-head"><span>Calls answered</span><span className="metric-icon"><PhoneCall size={16} /></span></div><div className="metric-value">186<span className="metric-unit">calls</span></div><div className="metric-foot"><span className="trend-pill"><ArrowUpRight size={13} /> 24%</span><span>vs. last month</span></div><div className="metric-bar"><span style={{ width: "78%" }} /></div><div className="metric-caption">78% of your monthly call target</div></div>
              <div className="metric-card"><div className="metric-head"><span>Booked jobs</span><span className="metric-icon"><CalendarClock size={16} /></span></div><div className="metric-value">37<span className="metric-unit">jobs</span></div><div className="metric-foot"><span className="trend-pill"><ArrowUpRight size={13} /> 12%</span><span>vs. last month</span></div><div className="mini-bars" aria-hidden="true">{[30, 54, 42, 68, 50, 84, 62, 73, 56, 94, 70, 100].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div></div>
              <div className="metric-card"><div className="metric-head"><span>Minutes used</span><span className="metric-icon"><Clock3 size={16} /></span></div><div className="metric-value">74<span className="metric-unit">/ {currentPlan.minutes} min</span></div><div className="metric-foot"><span className="neutral-pill">{Math.round((74 / currentPlan.minutes) * 100)}% used</span><span>resets Nov 1</span></div><div className="metric-bar minute-bar"><span style={{ width: `${Math.min(100, 74 / currentPlan.minutes * 100)}%` }} /></div><div className="metric-caption">{currentPlan.minutes - 74} minutes remaining on {currentPlan.label}</div></div>
            </section>

            <section className="middle-grid"><div className="panel performance-panel"><div className="panel-heading"><div><h2>Call performance</h2><p>Ghost handles the calls you can’t get to.</p></div><button className="select-pill" onClick={() => showToast("Showing the current month.")}>This month <ChevronDown size={14} /></button></div><div className="chart-legend"><span><i className="legend-green" /> Answered by Ghost</span><span><i className="legend-gray" /> Missed before Ghost</span><span className="chart-total">186 calls</span></div><div className="chart-area"><div className="chart-y"><span>60</span><span>40</span><span>20</span><span>0</span></div><svg className="chart-svg" viewBox="0 0 700 190" preserveAspectRatio="none" role="img" aria-label="Calls answered are trending upward while missed calls are trending downward"><line x1="0" y1="15" x2="700" y2="15"/><line x1="0" y1="68" x2="700" y2="68"/><line x1="0" y1="121" x2="700" y2="121"/><line x1="0" y1="174" x2="700" y2="174"/><path className="chart-fill" d="M0 145 C40 139 58 150 90 126 S138 134 174 111 220 123 257 88 302 116 344 81 385 100 425 61 470 85 512 53 552 75 596 43 644 65 700 23 V174 H0Z"/><path className="chart-line" d="M0 145 C40 139 58 150 90 126 S138 134 174 111 220 123 257 88 302 116 344 81 385 100 425 61 470 85 512 53 552 75 596 43 644 65 700 23"/><path className="chart-muted" d="M0 81 C38 88 56 72 94 91 S140 85 176 104 224 91 258 107 302 102 344 119 388 109 425 127 470 114 512 134 554 126 596 143 645 133 700 148"/></svg><div className="chart-x"><span>Oct 1</span><span>Oct 5</span><span>Oct 9</span><span>Oct 13</span><span>Oct 17</span><span>Oct 21</span><span>Oct 28</span></div></div><div className="performance-note"><div className="note-icon"><Sparkles size={15} /></div><p><strong>That’s about 14 more calls answered</strong> than last month. Most happened after 5 PM, when you’d normally be driving home.</p><span className="sample-label">SAMPLE</span></div></div>

              <div className="panel coverage-panel"><div className="panel-heading"><div><h2>Emergency coverage</h2><p>How Ghost prioritized today’s calls.</p></div><ShieldCheck size={18} className="coverage-shield" /></div><div className="coverage-list"><div className="coverage-row"><div className="coverage-level level-high"><ShieldAlert size={16} /></div><div className="coverage-copy"><strong>High urgency</strong><span>Owner alerted right away</span></div><b>4</b></div><div className="coverage-row"><div className="coverage-level level-medium"><Clock3 size={16} /></div><div className="coverage-copy"><strong>Medium urgency</strong><span>Queued for next-day booking</span></div><b>9</b></div><div className="coverage-row"><div className="coverage-level level-low"><Check size={16} /></div><div className="coverage-copy"><strong>Routine requests</strong><span>Booked without interrupting</span></div><b>24</b></div></div><button className="text-link" onClick={() => setPage("Calls")}>Review triage rules <ArrowRight size={14} /></button></div></section>

            <section className="panel calls-panel"><div className="panel-heading calls-heading"><div><div className="heading-with-dot"><h2>Recent calls</h2><span className="new-call-dot" /></div><p>The latest conversations Ghost handled.</p></div><button className="button button-light" onClick={() => setPage("Calls")}>View all calls <ArrowRight size={15} /></button></div><CallTable calls={calls.slice(0, 4)} onSelect={setSelectedCall} /></section>

            <section className="free-audit-card"><div className="audit-illustration"><div className="audit-ring ring-one"/><div className="audit-ring ring-two"/><div className="audit-icon"><BarChart3 size={24} /></div><span className="audit-spark">✳</span></div><div className="audit-copy"><div className="audit-tag"><Sparkles size={12} /> FREE, NO COMMITMENT</div><h2>How much did last month’s missed calls cost?</h2><p>Drop in a call log. We’ll estimate the jobs that slipped through, in about 10 seconds.</p></div><button className="button button-white" onClick={() => fileRef.current?.click()}><FileUp size={16} /> Upload call log <ArrowRight size={15} /></button></section>
          </>}

          {page === "Calls" && <section className="inner-page"><div className="inner-page-title"><div><div className="eyebrow">LIVE INBOX <span className="eyebrow-line" /> 186 CALLS THIS MONTH</div><h1>Your calls, covered.</h1><p className="welcome-copy">Every call, triaged, transcribed, and ready for you to review.</p></div><button className="button button-dark" onClick={() => showToast("Call export is available after connecting your phone system.")}><Download size={16} /> Export calls</button></div><div className="filter-row"><div className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, issue, or number" /></div><button className="filter-button" onClick={() => showToast("Filters are ready to use when live call data is connected.")}>All calls <ChevronDown size={14} /></button><button className="filter-button" onClick={() => showToast("Emergency-first view selected.")}>All urgency <ChevronDown size={14} /></button></div><div className="panel calls-panel full-calls-panel"><div className="call-results-top"><span>{filteredCalls.length} recent conversations</span><span className="results-note"><AudioLines size={14} /> Recordings stay private to your shop</span></div><CallTable calls={filteredCalls} onSelect={setSelectedCall} /></div><div className="privacy-note"><ShieldCheck size={16} /> Recordings should be disclosed to callers and retained only as long as your business needs. Configure your consent message before going live.</div></section>}

          {page === "Free call audit" && <section className="inner-page audit-page"><div className="inner-page-title"><div><div className="eyebrow">A LITTLE MATH. A LOT OF CLARITY <span className="eyebrow-line" /> FREE CALL AUDIT</div><h1>Find the jobs you missed.</h1><p className="welcome-copy">Your call history has a story. Let’s see what it was worth.</p></div></div><div className="audit-workspace"><div className="panel upload-panel"><div className="upload-icon"><FileAudio2 size={22} /></div><h2>Upload last month’s call log</h2><p>CSV from Twilio, your phone provider, or a spreadsheet. Your file is read here in your browser and isn’t uploaded to a server.</p><button className="button button-dark" onClick={() => fileRef.current?.click()}><FileUp size={16} /> Choose a CSV file</button><span className="upload-hint">CSV file · maximum 10 MB</span><div className="csv-columns"><strong>Best results with columns named</strong><span>Phone or caller <i>·</i> Status or outcome</span></div><a href="/sample-call-log.csv" download className="download-sample"><Download size={14} /> Download a sample call log</a></div><div className="audit-right"><div className="audit-explainer"><div className="step-dot">01</div><div><strong>We find calls nobody answered</strong><p>Missed, busy, no-answer, voicemail, and abandoned outcomes.</p></div></div><div className="audit-explainer"><div className="step-dot">02</div><div><strong>We estimate potential jobs</strong><p>A conservative 35% booking estimate, applied to your average job value.</p></div></div><div className="audit-explainer"><div className="step-dot">03</div><div><strong>You decide what to do next</strong><p>Your call log stays in this browser. Nothing is sent or stored.</p></div></div><div className="average-job"><label htmlFor="audit-average">Average job value</label><div><span>$</span><input id="audit-average" type="number" min="1" value={avgJob} onChange={(e) => setAvgJob(Math.max(1, Number(e.target.value)))} /></div><small>Used only to estimate possible missed revenue.</small></div></div></div>
            {audit && <div className="audit-result"><div className="result-top"><div><div className="eyebrow">YOUR CALL AUDIT <span className="eyebrow-line" /> {uploadName}</div><h2>Your missed calls may represent <em>{money(audit.missed * 0.35 * avgJob)}</em>.</h2><p>This is a directional estimate, not guaranteed revenue.</p></div><button className="icon-button" onClick={() => setAudit(null)} aria-label="Clear audit"><X size={18} /></button></div><div className="result-stats"><div><span>Call records checked</span><strong>{audit.total}</strong></div><div><span>Missed calls found</span><strong>{audit.missed}</strong></div><div><span>Estimated bookable jobs <i>35% assumption</i></span><strong>{Math.round(audit.missed * .35)}</strong></div><div><span>Average job value</span><strong>{money(avgJob)}</strong></div></div>{audit.examples.length > 0 && <p className="audit-examples">A few callers marked missed: {audit.examples.join(", ")}</p>}<div className="audit-disclaimer">Estimate: missed call records × 35% assumed booking rate × your average job value. This counts call records, not unique customers; actual recovery varies.</div></div>}
          </section>}

          {page === "Settings" && <section className="inner-page settings-page"><div className="inner-page-title"><div><div className="eyebrow">MAKE GHOST YOURS <span className="eyebrow-line" /> SHOP SETTINGS</div><h1>Set up your front desk.</h1><p className="welcome-copy">A few details help Ghost sound like it belongs in your shop.</p></div><button className="button button-dark" onClick={saveSettings}>{saved ? <Check size={16} /> : <Check size={16} />}{saved ? "Saved" : "Save changes"}</button></div><div className="settings-grid"><div className="panel settings-card"><div className="settings-card-title"><div className="settings-card-icon"><Wrench size={17} /></div><div><h2>Your trade & shop</h2><p>Set the calls and service area Ghost handles.</p></div></div><label className="form-label" htmlFor="trade-type">Primary trade</label><select id="trade-type" value={trade} onChange={(e) => setTrade(e.target.value)}><option>HVAC</option><option>Plumbing</option><option>Electrical</option></select><div className="trade-script"><div className="trade-script-head"><ShieldCheck size={15} /><strong>Trade-specific triage enabled</strong></div><span>{trade === "HVAC" ? "No-cool, thermostat, breaker, and comfort questions" : trade === "Plumbing" ? "Leak severity, water shutoff, and slab-leak questions" : "Sparks, smoke, breaker, and electrical safety questions"}</span></div><label className="form-label" htmlFor="average-job">Average completed job value</label><div className="input-with-prefix"><span>$</span><input id="average-job" type="number" min="1" value={avgJob} onChange={(e) => setAvgJob(Math.max(1, Number(e.target.value)))} /></div><p className="field-help">Used for the ROI estimate only. Update this from your actual average ticket.</p></div><div className="panel settings-card"><div className="settings-card-title"><div className="settings-card-icon"><ShieldAlert size={17} /></div><div><h2>Emergency escalation</h2><p>High-urgency calls get the owner’s attention.</p></div></div><label className="form-label" htmlFor="owner-phone">Owner’s mobile number</label><input id="owner-phone" type="tel" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} /><div className="escalation-preview"><span className="urgent-tag"><ShieldAlert size={13} /> HIGH URGENCY</span><span>Owner gets an immediate call and SMS</span><ChevronRight size={15} /></div><div className="safety-note"><ShieldCheck size={15} /><span>Ghost never gives repair instructions for a fire, suspected gas leak, or electrical hazard. It tells the caller to get to safety and contact emergency services.</span></div></div><div className="panel settings-card plan-settings"><div className="settings-card-title"><div className="settings-card-icon"><Zap size={17} /></div><div><h2>Your plan</h2><p>Minute caps stop voice spend creeping up.</p></div></div><div className="plan-selects">{(Object.entries(planInfo) as [keyof typeof planInfo, typeof planInfo.starter][]).map(([key, item]) => <button key={key} className={`plan-option ${plan === key ? "plan-selected" : ""}`} onClick={() => setPlan(key)}><div><span>{item.label}</span>{key === "growth" && <i>POPULAR</i>}</div><strong>${item.price}<small>/mo</small></strong><span>{item.minutes} minutes{key === "growth" ? " · Jobber sync" : key === "pro" ? " · 2 numbers · priority triage" : ""}</span></button>)}</div><div className="plan-meter"><span>This month</span><strong>74 / {currentPlan.minutes} min used</strong><div className="metric-bar minute-bar"><span style={{ width: `${Math.min(100, 74 / currentPlan.minutes * 100)}%` }} /></div><small>Plan changes in this demo only. Billing activates when Stripe is connected.</small></div></div><div className="panel settings-card integrations-card"><div className="settings-card-title"><div className="settings-card-icon"><Activity size={17} /></div><div><h2>Integrations</h2><p>Route approved jobs into your existing tools.</p></div></div><div className="integration-row"><div className="integration-logo jobber-logo">J</div><div><strong>Jobber</strong><span>OAuth connection · job sync</span></div><button onClick={() => showToast("Jobber OAuth needs your registered app credentials. See the launch checklist.")}>Connect <ArrowRight size={13} /></button></div><div className="integration-row"><div className="integration-logo hcp-logo">H</div><div><strong>Housecall Pro</strong><span>API connection · job sync</span></div><button onClick={() => showToast("Housecall Pro access requires an approved API key. See the launch checklist.")}>Connect <ArrowRight size={13} /></button></div><div className="integration-row"><div className="integration-logo twilio-logo"><Phone size={15} /></div><div><strong>Twilio</strong><span>Phone number · voice · SMS</span></div><button onClick={() => showToast("Twilio setup needs your account credentials and a verified number.")}>Connect <ArrowRight size={13} /></button></div></div></div><div className="settings-footer"><ShieldCheck size={15} /> Your recordings are private. Use an explicit recording disclosure and check local consent rules before turning on call recording.</div></section>}
        </div>

        <footer className="app-footer"><span>TRADEVOICE GHOST <i>·</i> NEVER MISS THE NEXT GOOD JOB</span><span><ShieldCheck size={13} /> Built for the people who pick up the tools</span></footer>
      </main>

      <input ref={fileRef} className="visually-hidden" type="file" accept=".csv,text/csv" onChange={importCsv} />
      {selectedCall && <CallDetail call={selectedCall} onClose={() => setSelectedCall(null)} onApprove={() => approve(selectedCall)} />}
      {toast && <div className="toast"><BadgeCheck size={17} /><span>{toast}</span><button onClick={() => setToast("")} aria-label="Dismiss notification"><X size={15} /></button></div>}
    </div>
  );
}

function CallTable({ calls, onSelect }: { calls: Call[]; onSelect: (call: Call) => void }) {
  return <div className="call-table-wrap"><div className="call-table-head"><span>CALLER</span><span>TIME</span><span>URGENCY</span><span>STATUS</span><span /></div>{calls.length === 0 ? <div className="empty-calls"><Search size={19} /><span>No calls match that search.</span></div> : calls.map((call, index) => <button key={call.id} className="call-row" onClick={() => onSelect(call)}><span className={`caller-avatar caller-${index % 5}`}>{call.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span className="caller-details"><strong>{call.name}</strong><span>{call.issue}</span></span><span className="call-time"><strong>{call.time}</strong><span>{call.duration}</span></span><span className={`urgency-badge urgency-${call.severity.toLowerCase()}`}><i />{call.severity}</span><span className={`status-badge status-${call.status.toLowerCase().replace(" ", "-")}`}>{call.status === "Booked" ? <Check size={12} /> : call.status === "Needs review" ? <Clock3 size={12} /> : <Phone size={12} />}{call.status}</span><ChevronRight size={16} className="row-chevron" /></button>)}</div>;
}

function CallDetail({ call, onClose, onApprove }: { call: Call; onClose: () => void; onApprove: () => void }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  }
  return <div className="modal-backdrop" onClick={onClose}><section className="call-drawer" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Call details for ${call.name}`}><header className="drawer-header"><div><span className="drawer-kicker">CALL {call.id}</span><h2>{call.name}</h2><span className="drawer-phone">{call.phone} <i>·</i> {call.location}</span></div><button className="icon-button" onClick={onClose} aria-label="Close call details"><X size={19} /></button></header><div className="drawer-badges"><span className={`urgency-badge urgency-${call.severity.toLowerCase()}`}><i />{call.severity} urgency</span><span className={`status-badge status-${call.status.toLowerCase().replace(" ", "-")}`}>{call.status}</span><span className="drawer-trade">{call.trade}</span></div><div className="drawer-section"><div className="drawer-section-title"><span>CALL SUMMARY</span><span>{call.time} <i>·</i> {call.duration}</span></div><div className="issue-card"><strong>{call.issue}</strong><p>{call.notes}</p></div></div><div className="drawer-section"><div className="drawer-section-title"><span>RECORDING</span><span>Private to your shop</span></div>{call.recordingUrl ? <div className="audio-player"><button className="play-button" onClick={togglePlayback} aria-label={playing ? "Pause recording" : "Play recording"}>{playing ? <span className="pause-symbol">Ⅱ</span> : <Play size={16} fill="currentColor" />}</button><div className="audio-progress"><div className="audio-wave">{Array.from({ length: 37 }).map((_, index) => <i key={index} style={{ height: `${8 + ((index * 19) % 18)}px` }} />)}</div><div className="audio-times"><span>0:00</span><span>{call.duration}</span></div></div><Headphones size={17} className="audio-headphones" /><audio ref={audioRef} src={call.recordingUrl} preload="none" onEnded={() => setPlaying(false)} /></div> : <div className="recording-empty"><Headphones size={17} /><span>Recording appears here after Retell is connected.</span></div>}</div><div className="drawer-section"><div className="drawer-section-title"><span>NEXT STEP</span><span>Ghost recommendation</span></div><div className={`next-step ${call.severity === "High" ? "next-step-high" : ""}`}>{call.severity === "High" ? <ShieldAlert size={18} /> : <CalendarClock size={18} />}<div><strong>{call.severity === "High" ? "Owner follow-up now" : "Offer the next available appointment"}</strong><span>{call.severity === "High" ? "Ghost flagged this for immediate human review." : "This call is ready for a next-day booking."}</span></div></div></div><div className="drawer-actions"><button className="button button-light" onClick={() => { window.location.href = `tel:${call.phone.replace(/[^+\d]/g, "")}`; }}>Call back <PhoneCall size={15} /></button>{call.status !== "Booked" && <button className="button button-dark" onClick={onApprove}><Check size={15} /> Approve booking</button>}</div><p className="drawer-sync-note">Demo action only · Jobber / Housecall Pro sync activates after connecting your account.</p></section></div>;
}
