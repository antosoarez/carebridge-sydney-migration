import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Login from "./pages/Login";
import Welcome from "./pages/Welcome";
import AdvocateDashboard from "./pages/AdvocateDashboard";
import AdvocateClients from "./pages/AdvocateClients";
import AdvocateClientDetail from "./pages/AdvocateClientDetail";
import ClientDashboard from "./pages/ClientDashboard";
import TaskDetail from "./pages/TaskDetail";
import CalendarPage from "./pages/Calendar";
import DocumentsPage from "./pages/Documents";
import Payments from "./pages/Payments";
import Settings from "./pages/Settings";
import SettingsAutomations from "./pages/SettingsAutomations";
import Messages from "./pages/Messages";
import BrainDump from "./pages/BrainDump";
import TodoList from "./pages/TodoList";
import Templates from "./pages/Templates";
import NotFound from "./pages/NotFound.tsx";
import Unsubscribe from "./pages/Unsubscribe";
import ResetPassword from "./pages/ResetPassword";
import Contact from "./pages/Contact";
import Intake from "./pages/Intake";
import CheckIn from "./pages/CheckIn";
import ChangePassword from "./pages/ChangePassword";
import VerifyEmailChange from "./pages/VerifyEmailChange";
import AvailabilityRequestsList from "./pages/AvailabilityRequestsList";
import AvailabilityRequestForm from "./pages/AvailabilityRequestForm";
import AvailabilityReceived from "./pages/AvailabilityReceived";
import AvailabilityConfirm from "./pages/AvailabilityConfirm";
import ClientAvailabilityList from "./pages/ClientAvailabilityList";
import ClientAvailabilityRespond from "./pages/ClientAvailabilityRespond";
import CodeOfConduct from "./pages/CodeOfConduct";
import ClientOnboarding from "./pages/ClientOnboarding";
import ClientNavigationIntake from "./pages/ClientNavigationIntake";
import { AuthProvider } from "./lib/auth";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const A = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute requireRole="advocate">{children}</ProtectedRoute>
);
const C = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute requireRole="client">{children}</ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/set-password" element={<Welcome />} />
            <Route path="/accept-invite" element={<Welcome />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/intake" element={<Intake />} />
            <Route path="/check-in" element={<CheckIn />} />
            <Route path="/change-password" element={<ChangePassword />} />

            <Route path="/advocate" element={<A><AdvocateDashboard /></A>} />
            <Route path="/advocate/clients" element={<A><AdvocateClients /></A>} />
            <Route path="/advocate/client/:id" element={<A><AdvocateClientDetail /></A>} />
            <Route path="/advocate/task/:id" element={<A><TaskDetail /></A>} />
            <Route path="/advocate/calendar" element={<A><CalendarPage /></A>} />
            <Route path="/advocate/documents" element={<A><DocumentsPage /></A>} />
            <Route path="/advocate/messages" element={<A><Messages role="advocate" /></A>} />
            <Route path="/advocate/messages/:id" element={<A><Messages role="advocate" /></A>} />
            <Route path="/advocate/payments" element={<A><Payments /></A>} />
            <Route path="/advocate/brain-dump" element={<A><BrainDump role="advocate" /></A>} />
            <Route path="/advocate/todo" element={<A><TodoList role="advocate" /></A>} />
            <Route path="/advocate/templates" element={<A><Templates /></A>} />
            <Route path="/advocate/availability" element={<A><AvailabilityRequestsList /></A>} />
            <Route path="/advocate/availability/new" element={<A><AvailabilityRequestForm /></A>} />
            <Route path="/advocate/availability/:id/edit" element={<A><AvailabilityRequestForm /></A>} />
            <Route path="/advocate/availability/:id/review" element={<A><AvailabilityReceived /></A>} />
            <Route path="/advocate/availability/:id/confirm" element={<A><AvailabilityConfirm /></A>} />
            <Route path="/advocate/settings" element={<A><Settings /></A>} />

            <Route path="/client" element={<C><ClientDashboard /></C>} />
            <Route path="/client/check-in" element={<C><CheckIn /></C>} />
            <Route path="/client/task/:id" element={<C><TaskDetail /></C>} />
            <Route path="/client/calendar" element={<C><CalendarPage /></C>} />
            <Route path="/client/documents" element={<C><DocumentsPage /></C>} />
            <Route path="/client/messages" element={<C><Messages role="client" /></C>} />
            <Route path="/client/availability" element={<C><ClientAvailabilityList /></C>} />
            <Route path="/client/availability/:id" element={<C><ClientAvailabilityRespond /></C>} />
            <Route path="/client/brain-dump" element={<C><BrainDump role="client" /></C>} />
            <Route path="/client/todo" element={<C><TodoList role="client" /></C>} />
            <Route path="/client/settings" element={<C><Settings /></C>} />
            <Route path="/client/code-of-conduct" element={<C><CodeOfConduct /></C>} />
            <Route path="/client/onboarding" element={<C><ClientOnboarding /></C>} />
            <Route path="/client/navigation-intake" element={<C><ClientNavigationIntake /></C>} />

            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email-change" element={<VerifyEmailChange />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
