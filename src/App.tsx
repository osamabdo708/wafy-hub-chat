import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Layout } from "@/components/Layout";
import { AuthGuard } from "@/components/AuthGuard";
import { InstallationGuard } from "@/components/InstallationGuard";
import Inbox from "./pages/Inbox";
import Orders from "./pages/Orders";
import Products from "./pages/Products";
import Categories from "./pages/Categories";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Store from "./pages/Store";
import ProductDetails from "./pages/ProductDetails";
import Auth from "./pages/Auth";
import Installation from "./pages/Installation";
import NotFound from "./pages/NotFound";
import Agents from "./pages/Agents";
import SuperAdmin from "./pages/SuperAdmin";
import { SuperAdminGuard } from "@/components/SuperAdminGuard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Root redirects to auth */}
            <Route path="/" element={<Navigate to="/auth" replace />} />
            
            {/* Auth page - shows login or installation based on system state */}
            <Route path="/auth" element={<Auth />} />
            
            {/* Installation - one-time setup (protected) */}
            <Route path="/installation" element={<InstallationGuard><Installation /></InstallationGuard>} />
            
            {/* Protected routes */}
            <Route element={<AuthGuard><Layout /></AuthGuard>}>
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/products" element={<Products />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/agents" element={<Agents />} />
            </Route>
            
            {/* Super Admin */}
            <Route path="/super-admin" element={<SuperAdminGuard><SuperAdmin /></SuperAdminGuard>} />
            
            {/* Public store */}
            <Route path="/store/:storeSlug" element={<Store />} />
            <Route path="/store/:storeSlug/product/:productId" element={<ProductDetails />} />
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
