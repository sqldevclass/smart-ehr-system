import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Signup from "./pages/Signup.tsx";
import Login from "./pages/Login.tsx";
import DashboardPlaceholder from "./pages/DashboardPlaceholder.tsx";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import AdminLayout from "./components/admin/AdminLayout.tsx";
import AdminOverview from "./pages/admin/AdminOverview.tsx";
import UserManagement from "./pages/admin/UserManagement.tsx";
import AdminPlaceholder from "./pages/admin/AdminPlaceholder.tsx";
import AdminProfile from "./pages/admin/AdminProfile.tsx";
import DepartmentsPage from "./pages/admin/DepartmentsPage.tsx";
import PhysiciansPage from "./pages/admin/PhysiciansPage.tsx";
import RoomsPage from "./pages/admin/RoomsPage.tsx";
import ServicesPage from "./pages/admin/ServicesPage.tsx";
import PhysicianPrivilegesPage from "./pages/admin/PhysicianPrivilegesPage.tsx";
import RegistrarLayout from "./components/registrar/RegistrarLayout.tsx";
import PatientsList from "./pages/registrar/PatientsList.tsx";
import PatientDetail from "./pages/registrar/PatientDetail.tsx";
import RegistrarProfile from "./pages/registrar/RegistrarProfile.tsx";

import VisitPage from "./pages/registrar/VisitPage.tsx";
import CashierLayout from "./components/cashier/CashierLayout.tsx";
import PaymentsPage from "./pages/cashier/PaymentsPage.tsx";
import CashierProfile from "./pages/cashier/CashierProfile.tsx";
import PhysicianLayout from "./components/physician/PhysicianLayout.tsx";
import MyPatientsList from "./pages/physician/MyPatientsList.tsx";
import PhysicianPatientDetail from "./pages/physician/PhysicianPatientDetail.tsx";
import ExamCardDetail from "./pages/physician/ExamCardDetail.tsx";
import PhysicianProfile from "./pages/physician/PhysicianProfile.tsx";
import PhysicianSchedule from "./pages/physician/PhysicianSchedule.tsx";
import HRLayout from "./components/hr/HRLayout.tsx";
import HRSchedules from "./pages/hr/HRSchedules.tsx";
import HREmployees from "./pages/hr/HREmployees.tsx";
import HRProfile from "./pages/hr/HRProfile.tsx";
import QueueDisplay from "./pages/QueueDisplay.tsx";
import AuthCallback from "./pages/auth/AuthCallback.tsx";
import SetPassword from "./pages/auth/SetPassword.tsx";
import CallbackError from "./pages/auth/CallbackError.tsx";
import AcceptInvite from "./pages/AcceptInvite.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/invite" element={<AcceptInvite />} />
          <Route path="/queue/:displayToken" element={<QueueDisplay />} />
          <Route path="/admin" element={<ProtectedRoute allowedRoles={["admin"]}><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminOverview />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="departments" element={<DepartmentsPage />} />
            <Route path="services" element={<ServicesPage />} />
            <Route path="physicians" element={<PhysiciansPage />} />
            <Route path="rooms" element={<RoomsPage />} />
            <Route path="physician-privileges" element={<PhysicianPrivilegesPage />} />
            <Route path="audit" element={<AdminPlaceholder title="Audit Log" />} />
            <Route path="profile" element={<AdminProfile />} />
          </Route>
          <Route path="/physician" element={<ProtectedRoute allowedRoles={["physician"]}><PhysicianLayout /></ProtectedRoute>}>
            <Route index element={<MyPatientsList />} />
            <Route path="patients/:patientId" element={<PhysicianPatientDetail />} />
            <Route path="patients/:patientId/exam/:examId" element={<ExamCardDetail />} />
            <Route path="schedule" element={<PhysicianSchedule />} />
            <Route path="profile" element={<PhysicianProfile />} />
          </Route>
          <Route path="/registrar" element={<ProtectedRoute allowedRoles={["outpatient_registrar"]}><RegistrarLayout /></ProtectedRoute>}>
            <Route index element={<PatientsList />} />
            <Route path="patients/:patientId" element={<PatientDetail />} />
            <Route path="visits/:visitId" element={<VisitPage />} />
            <Route path="profile" element={<RegistrarProfile />} />
          </Route>
          <Route path="/hr" element={<ProtectedRoute allowedRoles={["hr"]}><HRLayout /></ProtectedRoute>}>
            <Route index element={<HRSchedules />} />
            <Route path="schedules" element={<HRSchedules />} />
            <Route path="employees" element={<HREmployees />} />
            <Route path="profile" element={<HRProfile />} />
          </Route>
          <Route path="/cashier" element={<ProtectedRoute allowedRoles={["cashier"]}><CashierLayout /></ProtectedRoute>}>
            <Route index element={<PaymentsPage />} />
            <Route path="profile" element={<CashierProfile />} />
          </Route>
          <Route path="/pharmacy" element={<ProtectedRoute allowedRoles={["pharmacist"]}><DashboardPlaceholder expectedRole="pharmacist" /></ProtectedRoute>} />
          <Route path="/warehouse" element={<ProtectedRoute allowedRoles={["warehouse_staff"]}><DashboardPlaceholder expectedRole="warehouse_staff" /></ProtectedRoute>} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/auth/set-password" element={<SetPassword />} />
          <Route path="/auth/callback-error" element={<CallbackError />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
