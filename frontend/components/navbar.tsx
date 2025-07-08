import { useTheme } from "next-themes";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, Menu, Moon, Sun, User } from "lucide-react";
import AccountDropdown from "@/components/ui-custom/account-dropdown";
import { AuthModal, ResetPasswordModal } from "@/components/auth-modals";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AccountContext, AuthModalContext } from "@/app/providers";
import type { AccountView } from "@/types/provider-types";
import { useQuery } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { account } from "@/lib/appwrite";

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  active?: boolean;
}

export function NavItem({ href, icon, children, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 rounded-lg",
        active &&
          "bg-accent-100 dark:bg-accent-900 text-accent-600 dark:text-accent-200",
      )}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}

export function Navbar({
  onMenuClick,
  children,
}: {
  onMenuClick: () => void;
  children?: React.ReactNode;
}) {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] =
    useState(false);

  // Use the AuthModalContext instead of local state
  const authModalContext = React.useContext(AuthModalContext);
  if (!authModalContext) throw new Error("Auth modal context not found");
  const { openAuthModal, authType } = authModalContext;

  useEffect(() => setMounted(true), []);

  const handleAuthClick = () => {
    openAuthModal("login");
  };

  const handleAuthSwitch = () => {
    openAuthModal(authType === "login" ? "signup" : "login");
  };

  const handleForgotPassword = () => {
    authModalContext.closeAuthModal();
    setIsResetPasswordModalOpen(true);
  };

  const setAccount = React.useContext(AccountContext)?.setAccount;
  if (!setAccount) throw new Error("Account not found");
  const { data, error } = useQuery({
    queryKey: ["user-data"],
    queryFn: async () => {
      try {
        const user = await account.get();
        return {
          user_id: user.$id,
          username: user.name,
          email: user.email,
        } as AccountView;
      } catch {
        setAccount(null);
        throw new Error("unauthorized");
      }
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
  useEffect(() => {
    if (data) setAccount(data);
    if (error) toast.error("Failed to fetch user scores");
  }, [data, error, setAccount]);

  const context = React.useContext(AccountContext);
  if (!context) throw new Error("Account context not found.");
  const { accountView } = context;

  return (
    <>
      <header className="flex items-center justify-between border-b px-6 py-4 dark:border-gray-700 bg-gray-50 dark:bg-gray-850">
        <div className="flex items-center gap-4 overflow-hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="xl:hidden"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-6 w-6" />
          </Button>
          {children}
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
            disabled={!mounted}
          >
            {mounted &&
              (resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              ))}
          </Button>
          <Button variant="ghost" size="icon">
            <Bell className="h-4 w-4" />
          </Button>
          {/* If user is logged in, display their name and email; otherwise show the auth button */}
          {accountView ? (
            <AccountDropdown />
          ) : (
            <Button
              size="icon"
              className="rounded-full"
              onClick={handleAuthClick}
            >
              <User className="h-6 w-6 text-gray-900 dark:text-white" />
            </Button>
          )}
        </div>
      </header>
      <AuthModal
        isOpen={authModalContext.isOpen}
        onClose={authModalContext.closeAuthModal}
        onSwitch={handleAuthSwitch}
        type={authType}
        onForgotPassword={handleForgotPassword}
      />
      <ResetPasswordModal
        isOpen={isResetPasswordModalOpen}
        onClose={() => setIsResetPasswordModalOpen(false)}
      />
    </>
  );
}
