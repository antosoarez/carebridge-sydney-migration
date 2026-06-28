import { ProtectedRoute } from "@/components/ProtectedRoute";

interface Props {
  children: React.ReactNode;
}

/** Blocks unauthenticated users, clients, and missing-role sessions from advocate routes. */
export function RequireAdvocate({ children }: Props) {
  return <ProtectedRoute requireRole="advocate">{children}</ProtectedRoute>;
}

/** Blocks unauthenticated users and advocates from client routes. */
export function RequireClient({ children }: Props) {
  return <ProtectedRoute requireRole="client">{children}</ProtectedRoute>;
}
