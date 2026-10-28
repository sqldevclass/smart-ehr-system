import { Navigate } from "react-router-dom";
import { useAuthContext } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  allowedRoles?: string[];
  anyPermission?: string[];
  children: React.ReactNode;
}

const ProtectedRoute = ({ allowedRoles = [], anyPermission = [], children }: ProtectedRouteProps) => {
  const { user, loading } = useAuthContext();

  if (loading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const allowed =
    user.roles.includes("admin") ||
    allowedRoles.some((r) => user.roles.includes(r)) ||
    anyPermission.some((p) => user.permissions.includes(p));
  if (!allowed) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
