import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Layout } from "@/components/Layout";
import { AuthGuard } from "@/components/AuthGuard";
import { InstallationGuard } from "@/components/InstallationGuard";
import { AgentAuthProvider } from "@/contexts/AgentAuthContext";
import AgentGuard from "@/components/AgentGuard";
import Inbox from "./pages/Inbox";
import Orders from "./pages/Orders";
import POS from "./pages/POS";
import Products from "./pages/Products";
import Categories from "./pages/Categories";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Store from "./pages/Store";
import ProductDetails from "./pages/ProductDetails";
import OrderDetails from "./pages/OrderDetails";
import Auth from "./pages/Auth";
import AgentLogin from "./pages/AgentLogin";
import Installation from "./pages/Installation";
import NotFound from "./pages/NotFound";
import Agents from "./pages/Agents";
import Clients from "./pages/Clients";
import SuperAdmin from "./pages/SuperAdmin";
import PaymentStatus from "./pages/PaymentStatus";
import { SuperAdminGuard } from "@/components/SuperAdminGuard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AgentAuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Root redirects to auth */}
              <Route path="/" element={<Navigate to="/auth" replace />} />
              
              {/* Auth pages */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/agent-login" element={<AgentLogin />} />
              
              {/* Installation - one-time setup (protected) */}
              <Route path="/installation" element={<InstallationGuard><Installation /></InstallationGuard>} />
              
              {/* Protected admin routes */}
              <Route element={<AuthGuard><Layout /></AuthGuard>}>
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/orders/:orderId" element={<OrderDetails />} />
                <Route path="/pos" element={<POS />} />
                <Route path="/clients" element={<Clients />} />
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
              
              {/* Payment status page */}
              <Route path="/pay/:orderNumber" element={<PaymentStatus />} />
              
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AgentAuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
