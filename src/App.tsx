import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Loader2 } from 'lucide-react';
import StudentLogin from '@/pages/student/StudentLogin';
import SeriesSelection from '@/pages/student/SeriesSelection';
import ExamScreen from '@/pages/student/ExamScreen';
import StudentHistory from '@/pages/student/StudentHistory';
import Revision from '@/pages/student/Revision';
import AdminLogin from '@/pages/admin/AdminLogin';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import AdminStudents from '@/pages/admin/AdminStudents';
import SeriesDetail from '@/pages/admin/SeriesDetail';
import type { ReactNode } from 'react';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
    </div>
  );
}

function StudentRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Student routes */}
      <Route path="/login" element={<StudentLogin />} />
      <Route
        path="/"
        element={
          <StudentRoute>
            <SeriesSelection />
          </StudentRoute>
        }
      />
      <Route
        path="/exam/:seriesId"
        element={
          <StudentRoute>
            <ExamScreen />
          </StudentRoute>
        }
      />
      <Route
        path="/revision"
        element={
          <StudentRoute>
            <Revision />
          </StudentRoute>
        }
      />
      <Route
        path="/revision/exam"
        element={
          <StudentRoute>
            <ExamScreen revisionMode />
          </StudentRoute>
        }
      />
      <Route
        path="/history"
        element={
          <StudentRoute>
            <StudentHistory />
          </StudentRoute>
        }
      />

      {/* Admin routes */}
      <Route path="/admin" element={<AdminLogin />} />
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/students"
        element={
          <ProtectedRoute>
            <AdminStudents />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/series/:seriesId"
        element={
          <ProtectedRoute>
            <SeriesDetail />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
