import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  Calendar,
  CalendarCheck,
  CheckCheck,
  MessageCircle,
  Sparkles,
  Waves,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useNotifications, AppNotification } from "@/hooks/use-notifications";

function iconFor(kind: string) {
  if (kind === "new_message") return MessageCircle;
  if (kind === "appointment_confirmed") return CalendarCheck;
  if (kind.startsWith("appointment_reminder")) return Calendar;
  if (kind.startsWith("availability_")) return Sparkles;
  return Waves;
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function NotificationRow({
  n,
  onClick,
  onDismiss,
}: {
  n: AppNotification;
  onClick: () => void;
  onDismiss: () => void;
}) {
  const Icon = iconFor(n.kind);
  const isUnread = !n.read_at;
  const content = (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-2xl transition-calm",
        isUnread ? "bg-success/10" : "bg-transparent hover:bg-secondary/60"
      )}
    >
      <div
        className={cn(
          "shrink-0 h-9 w-9 rounded-2xl flex items-center justify-center",
          isUnread
            ? "bg-success/20 text-success border border-success/30"
            : "bg-secondary text-muted-foreground"
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm text-primary-deep truncate">{n.title}</p>
          {isUnread && (
            <span aria-hidden className="h-2 w-2 rounded-full bg-success shadow-soft shrink-0" />
          )}
        </div>
        {n.body && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
        )}
        <p className="text-[11px] text-muted-foreground/80 mt-1">{timeAgo(n.created_at)}</p>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDismiss();
        }}
        className="shrink-0 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  if (n.link) {
    return (
      <Link to={n.link} onClick={onClick} className="block">
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className="block w-full text-left">
      {content}
    </button>
  );
}

export function NotificationBell() {
  const { items, unread, loading, markRead, markAllRead, dismiss } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
          className="relative h-11 w-11 rounded-2xl bg-secondary/60 hover:bg-secondary text-primary-deep border border-border/60 flex items-center justify-center transition-calm active:scale-95"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-success text-success-foreground text-[10px] font-bold flex items-center justify-center shadow-soft"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(380px,92vw)] p-0 rounded-3xl border-border/60 shadow-elegant"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <div>
            <p className="font-display text-base text-primary-deep">Notifications</p>
            <p className="text-[11px] text-muted-foreground">
              {unread > 0 ? `${unread} unread` : "You're all caught up"}
            </p>
          </div>
          {unread > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void markAllRead()}
              className="h-8 rounded-xl text-xs gap-1.5"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[60vh]">
          <div className="p-2 space-y-1">
            {loading ? (
              <div className="py-10 text-center text-xs text-muted-foreground">Loading…</div>
            ) : items.length === 0 ? (
              <div className="py-10 px-6 text-center">
                <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-sky flex items-center justify-center mb-3">
                  <Waves className="h-5 w-5 text-primary-deep" />
                </div>
                <p className="font-semibold text-sm text-primary-deep">All caught up 🌊</p>
                <p className="text-xs text-muted-foreground mt-1">
                  We'll let you know when something needs you.
                </p>
              </div>
            ) : (
              items.map((n) => (
                <NotificationRow
                  key={n.id}
                  n={n}
                  onClick={() => {
                    if (!n.read_at) void markRead(n.id);
                    setOpen(false);
                  }}
                  onDismiss={() => void dismiss(n.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
