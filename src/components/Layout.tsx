import { Outlet } from "react-router-dom";
import { Header } from "@/components/Header";
import { HorizontalNav } from "@/components/HorizontalNav";

export const Layout = () => {
  return (
    <div className="min-h-screen w-full bg-background">
      <Header />
      <HorizontalNav />
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
};
