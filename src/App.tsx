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
import RegistrarLayout from "./components/registrar/RegistrarLayout.tsx";
import PatientsList from "./pages/registrar/PatientsList.tsx";
import PatientDetail from "./pages/registrar/PatientDetail.tsx";
import RegistrarProfile from "./pages/registrar/RegistrarProfile.tsx";
import PhysicianLayout from "./components/physician/PhysicianLayout.tsx";
import MyPatientsList from "./pages/physician/MyPatientsList.tsx";
import PhysicianPatientDetail from "./pages/physician/PhysicianPatientDetail.tsx";
import ExamCardDetail from "./pages/physician/ExamCardDetail.tsx";
import PhysicianProfile from "./pages/physician/PhysicianProfile.tsx";
import PhysicianSchedule from "./pages/physician/PhysicianSchedule.tsx";
import AuthCallback from "./pages/auth/AuthCallback.tsx";
import SetPassword from "./pages/auth/SetPassword.tsx";

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
          <Route path="/admin" element={<ProtectedRoute allowedRoles={["admin"]}><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminOverview />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="departments" element={<AdminPlaceholder title="Departments" />} />
            <Route path="services" element={<AdminPlaceholder title="Services" />} />
            <Route path="physicians" element={<AdminPlaceholder title="Physicians" />} />
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
          <Route path="/registrar" element={<ProtectedRoute allowedRoles={["registrar"]}><RegistrarLayout /></ProtectedRoute>}>
            <Route index element={<PatientsList />} />
            <Route path="patients/:patientId" element={<PatientDetail />} />
            <Route path="profile" element={<RegistrarProfile />} />
          </Route>
          <Route path="/pharmacy" element={<ProtectedRoute allowedRoles={["pharmacy_staff"]}><DashboardPlaceholder expectedRole="pharmacy_staff" /></ProtectedRoute>} />
          <Route path="/warehouse" element={<ProtectedRoute allowedRoles={["warehouse_staff"]}><DashboardPlaceholder expectedRole="warehouse_staff" /></ProtectedRoute>} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/auth/set-password" element={<SetPassword />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
