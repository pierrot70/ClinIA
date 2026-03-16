import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getDefaultRouteForRole, type UserRole } from "../auth/roles";

type ProtectedRouteProps = {
    children?: React.ReactElement;
    allowedRoles?: UserRole[];
    redirectTo?: string;
};

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
    children,
    allowedRoles,
    redirectTo = "/login",
}) => {
    const location = useLocation();
    const { status, user, isAuthenticated } = useAuth();

    if (status === "loading") {
        return (
            <div className="max-w-6xl mx-auto px-4 py-8">
                <p className="text-sm text-gray-500">Validation de session...</p>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />;
    }

    if (allowedRoles?.length) {
        if (user) {
            const hasAllowedRole = allowedRoles.includes(user.role);
            if (!hasAllowedRole) {
                return <Navigate to={getDefaultRouteForRole(user.role)} replace />;
            }
        } else {
            return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />;
        }
    }

    return children ?? <Outlet />;
};

export default ProtectedRoute;
