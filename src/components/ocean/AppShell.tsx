import { ReactNode, useEffect } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";
import { Calendar, CalendarClock, ClipboardList, FileText, Heart, Home, LayoutDashboard, ListChecks, LogOut, MessageCircle, MoreHorizontal, Settings, ShieldCheck, Users, Wallet, Waves, FileStack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BrainDumpCloud } from "./BrainDumpCloud";
import { NeedAHandButton } from "./NeedAHandButton";
import { useAuth } from "@/lib/auth";
import { useUnreadMessages } from "@/lib/use-unread-messages";
import { useMessageChime } from "@/lib/use-message-chime";
import { useNewMessageToasts } from "@/lib/use-new-message-toasts";
import { useInboundEnquiries } from "@/lib/use-inbound-enquiries";
import { useReminderScheduler } from "@/lib/use-reminder-scheduler";
import { useAttentionBadges } from "@/lib/attention-badges";
import { UpcomingAppointmentNudge } from "@/components/ocean/UpcomingAppointmentNudge";
import { InstallPwaPrompt } from "@/components/ocean/InstallPwaPrompt";
import { EnablePushPrompt } from "@/components/ocean/EnablePushPrompt";
import { registerServiceWorker } from "@/lib/push-subscription";
import { FloatingActionStack } from "@/components/ocean/FloatingActionStack";
import { NotificationBell } from "@/components/ocean/NotificationBell";
import { SEO } from "@/components/SEO";
import { EmergencyNotice } from "@/components/ocean/EmergencyNotice";

interface NavItem { to: string; label: string; icon: typeof Home; }

const CLIENT_THREAD_ID = "c1";

const advocateNav: NavItem[] = [
  { to: "/advocate", label: "Dashboard", icon: LayoutDashboard },
  { to: "/advocate/clients", label: "Clients", icon: Users },
  { to: "/advocate/messages", label: "Messages", icon: MessageCircle },
  { to: "/check-in", label: "Check in", icon: Heart },
  { to: "/advocate/calendar", label: "Calendar", icon: Calendar },
  { to: "/advocate/todo", label: "To-do", icon: ListChecks },
  { to: "/advocate/brain-dump", label: "Brain Dump", icon: Waves },
  { to: "/advocate/documents", label: "Documents", icon: FileText },
  { to: "/advocate/templates", label: "Templates", icon: FileStack },
  { to: "/advocate/payments", label: "Payments", icon: Wallet },
  { to: "/advocate/settings", label: "Settings", icon: Settings },
];

const clientNav: NavItem[] = [
  { to: "/client", label: "Today", icon: Home },
  { to: "/client/payment", label: "Payment", icon: Wallet },
  { to: "/client/check-in", label: "Check in", icon: Heart },
  { to: "/client/messages", label: "Messages", icon: MessageCircle },
  { to: "/client/todo", label: "To-do", icon: ListChecks },
  { to: "/client/availability", label: "Availability", icon: CalendarClock },
  { to: "/client/brain-dump", label: "Brain Dump", icon: Waves },
  { to: "/client/calendar", label: "Calendar", icon: Calendar },
  { to: "/client/documents", label: "Documents", icon: FileText },
  { to: "/client/intake-form", label: "Intake form", icon: ClipboardList },
  { to: "/client/agreements", label: "Policies & Agreements", icon: ShieldCheck },
  { to: "/client/settings", label: "Settings", icon: Settings },
];

export function AppShell({ role, children, title, subtitle, seoTitle, seoDescription }: { role: "advocate" | "client"; children: ReactNode; title?: string; subtitle?: string; seoTitle?: string; seoDescription?: string }) {
  const nav = role === "advocate" ? advocateNav : clientNav;
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { total: unread } = useUnreadMessages();
  useMessageChime(unread);
  useNewMessageToasts(role);
  const { newCount: inboundNew } = useInboundEnquiries(role === "advocate");
  useReminderScheduler(user?.id);
  const attention = useAttentionBadges(role);
  const handleSignOut = async () => { await signOut(); navigate("/"); };
  const badgeFor = (to: string) => {
    if (!to.endsWith("/messages")) return 0;
    const extra = role === "advocate" ? inboundNew : 0;
    return unread + extra;
  };
  const showDot = (to: string) =>
    (to.endsWith("/calendar") && attention.calendar) ||
    (to.endsWith("/todo") && attention.todo);
  const pageTitle = seoTitle ?? title ?? "CareBridge Perth";
  const pageDesc = seoDescription ?? subtitle ?? "Calm Care for healthcare advocates and their clients — gentle, organized, low-pressure.";

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <SEO title={pageTitle} description={pageDesc} />
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex md:w-64 flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur-xl p-6 sticky top-0 h-screen">
        <Logo />
        <nav className="mt-10 flex flex-col gap-1">
          {nav.map((item) => {
            const count = badgeFor(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === `/${role}`}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-calm",
                    isActive
                      ? "bg-gradient-ocean text-primary-foreground shadow-soft"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {count > 0 ? (
                  <span aria-label={`${count} unread messages`} className="min-w-[20px] h-5 px-1.5 rounded-full bg-success/15 text-success border border-success/30 text-[11px] font-semibold flex items-center justify-center">
                    {count > 9 ? "9+" : count}
                  </span>
                ) : showDot(item.to) ? (
                  <span aria-label="Needs attention" className="h-2 w-2 rounded-full bg-accent/80 shadow-soft" />
                ) : null}
              </NavLink>
            );
          })}
        </nav>
        <div className="mt-auto pt-6">
          <div className="rounded-2xl bg-gradient-sky p-4 text-sm">
            <div className="font-display text-base text-primary-deep">Calm waters today 🌊</div>
            <div className="text-muted-foreground mt-1 text-xs leading-relaxed">Take it one task at a time. We've got the rest.</div>
          </div>
          <Button variant="ghost" className="mt-3 w-full justify-start gap-2 text-muted-foreground" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 pb-24 md:pb-8">
        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border px-5 py-4 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="px-5 md:px-10 pt-6 md:pt-10 max-w-6xl mx-auto">
          <EmergencyNotice className="mb-4" compact />

          {title && (
            <div className="mb-8 animate-fade-in">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="font-display text-3xl md:text-4xl text-primary-deep">{title}</h1>
                  {subtitle && <p className="text-muted-foreground mt-2 text-balance">{subtitle}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="hidden md:block"><NotificationBell /></div>
                  <Link
                    to={role === "advocate" ? "/advocate/calendar" : "/client/calendar"}
                    aria-label="Calendar"
                    className="h-12 w-12 rounded-2xl bg-success/10 text-success border-2 border-success/30 flex items-center justify-center transition-calm hover:bg-success/20 hover:shadow-soft active:scale-95"
                  >
                    <Calendar className="h-5 w-5" />
                  </Link>
                  <Link
                    to={role === "advocate" ? "/advocate/messages" : "/client/messages"}
                    aria-label="Messages"
                    className="h-12 w-12 rounded-2xl bg-success/10 text-success border-2 border-success/30 flex items-center justify-center transition-calm hover:bg-success/20 hover:shadow-soft active:scale-95"
                  >
                    <MessageCircle className="h-5 w-5" />
                  </Link>
                </div>
              </div>
            </div>
          )}
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card/90 backdrop-blur-xl border-t border-border px-2 py-2 flex justify-around">
        {nav.slice(0, 4).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === `/${role}`}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-1 px-3 py-2 rounded-2xl text-[11px] font-semibold transition-calm min-w-0",
                isActive ? "text-primary" : "text-muted-foreground"
              )
            }
          >
            {({ isActive }) => (
              <>
                <div className={cn("relative p-1.5 rounded-xl transition-calm", isActive && "bg-gradient-ocean text-primary-foreground shadow-soft")}>
                  <item.icon className="h-4 w-4" />
                  {badgeFor(item.to) > 0 ? (
                    <span aria-label={`${badgeFor(item.to)} unread`} className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-success text-success-foreground text-[9px] font-semibold flex items-center justify-center shadow-soft">
                      {badgeFor(item.to) > 9 ? "9+" : badgeFor(item.to)}
                    </span>
                  ) : showDot(item.to) ? (
                    <span aria-label="Needs attention" className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent/80 shadow-soft" />
                  ) : null}
                </div>
                <span className="truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
        <Sheet>
          <SheetTrigger asChild>
            <button className="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl text-[11px] font-semibold transition-calm min-w-0 text-muted-foreground">
              <div className="p-1.5 rounded-xl">
                <MoreHorizontal className="h-4 w-4" />
              </div>
              <span className="truncate">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl">
            <SheetHeader>
              <SheetTitle className="font-display text-primary-deep text-left">Menu</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-3 mt-4 pb-4">
              {nav.slice(4).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "flex flex-col items-center gap-2 p-4 rounded-2xl text-xs font-semibold transition-calm",
                      isActive ? "bg-gradient-ocean text-primary-foreground shadow-soft" : "bg-secondary/60 text-primary-deep hover:bg-secondary"
                    )
                  }
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
              <button
                onClick={handleSignOut}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl text-xs font-semibold bg-secondary/60 text-muted-foreground hover:text-destructive"
              >
                <LogOut className="h-5 w-5" />
                <span>Sign out</span>
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </nav>

      <FloatingActionStack>
        {/* flex-col-reverse: first child renders at the BOTTOM (primary). */}
        {role === "client" && <NeedAHandButton />}
        <BrainDumpCloud author={role} />
      </FloatingActionStack>
      {role === "client" && <UpcomingAppointmentNudge />}
      <InstallPwaPrompt />
      <EnablePushPrompt />
      <RegisterSwOnce />
    </div>
  );
}

function RegisterSwOnce() {
  useEffect(() => { void registerServiceWorker(); }, []);
  return null;
}

