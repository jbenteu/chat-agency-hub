import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, type UserRole } from "./AuthProvider";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { session, loading, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate("/login", { replace: true });
      return;
    }
    if (allowedRoles && profile) {
      const role = profile.role ?? "cliente";
      if (!allowedRoles.includes(role)) {
        navigate("/", { replace: true });
      }
    }
  }, [loading, session, profile, allowedRoles, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) return null;

  if (allowedRoles && profile) {
    const role = profile.role ?? "cliente";
    if (!allowedRoles.includes(role)) return null;
  }

  return <>{children}</>;
};
